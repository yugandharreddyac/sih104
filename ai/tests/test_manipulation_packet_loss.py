"""
Unit Tests for AudioManipulationDetector: Network Packet Gap Boundary Suppression (Priority 5)

Validates:
1. Consecutive chunks (N -> N+1) maintain active boundary discontinuity detection.
2. Single missing packet (N -> N+2) suppresses boundary step false positive.
3. Multiple missing packets (N -> N+k, k > 2) suppresses boundary step false positive.
4. Within-chunk splicing (>0.70 sample diff) remains detected even during a packet gap.
5. Packet repetition (identical repeated blocks) remains detected even during a packet gap.
6. Subsequent consecutive chunk resumes normal boundary checking after a gap.
7. Multi-session isolation ensures independent sequence and boundary tracking.
8. End-to-end AudioStreamPipeline integration respects chunk_index and metadata sequenceGap.
"""

import os
import sys
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from ai.app.audio.manipulation import AudioManipulationDetector
from ai.app.core.types import ManipulationLevel, AudioChunkPayload
from ai.app.audio.stream_pipeline import AudioStreamPipeline
import base64


def make_clean_chunk(sample_count: int = 1600, start_val: float = 0.1, end_val: float = 0.2) -> np.ndarray:
    """Generates smooth, clean chunk with values ramping gently from start_val to end_val."""
    return np.linspace(start_val, end_val, sample_count, dtype=np.float32)


def make_pcm_base64_from_array(samples: np.ndarray) -> str:
    int16_samples = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    return base64.b64encode(int16_samples.tobytes()).decode("utf-8")


def test_scenario_a_consecutive_chunks_boundary_active():
    """Scenario A: Consecutive chunks (seq 0 -> 1) with large boundary step trigger boundary cue."""
    detector = AudioManipulationDetector()
    detector.reset()

    # Chunk 0 ends at +0.40
    chunk0 = make_clean_chunk(1600, start_val=0.0, end_val=0.40)
    res0 = detector.analyze(chunk0, sequence_number=0)
    assert res0.level == ManipulationLevel.NO_INDICATOR
    assert res0.discontinuity_score == 0.0

    # Chunk 1 starts at -0.30 (step = |-0.30 - 0.40| = 0.70 > 0.45)
    # Consecutive sequence (seq 1), so boundary step MUST trigger
    chunk1 = make_clean_chunk(1600, start_val=-0.30, end_val=-0.20)
    res1 = detector.analyze(chunk1, sequence_number=1)
    assert res1.level == ManipulationLevel.MODERATE_INDICATOR
    assert res1.discontinuity_score > 0.45
    assert any("discontinuity step" in ind for ind in res1.indicators)


def test_scenario_b_single_missing_packet_suppressed():
    """Scenario B: Missing packet (seq 0 -> 2, packet 1 lost) suppresses boundary step false positive."""
    detector = AudioManipulationDetector()
    detector.reset()

    # Chunk 0 ends at +0.40
    chunk0 = make_clean_chunk(1600, start_val=0.0, end_val=0.40)
    res0 = detector.analyze(chunk0, sequence_number=0)
    assert res0.level == ManipulationLevel.NO_INDICATOR

    # Chunk 2 arrives (packet 1 dropped). Chunk 2 starts at -0.30 (step 0.70)
    # Because sequence jumped from 0 -> 2, boundary cue MUST be suppressed!
    chunk2 = make_clean_chunk(1600, start_val=-0.30, end_val=-0.20)
    res2 = detector.analyze(chunk2, sequence_number=2)

    assert res2.level == ManipulationLevel.NO_INDICATOR
    assert res2.discontinuity_score == 0.0
    assert not any("discontinuity step" in ind for ind in res2.indicators)
    assert any("Network packet gap detected" in exp for exp in res2.explainability)


def test_scenario_c_multiple_missing_packets_suppressed():
    """Scenario C: Multiple missing packets (seq 0 -> 5) suppresses boundary cue."""
    detector = AudioManipulationDetector()
    detector.reset()

    # Chunk 0 ends at +0.50
    chunk0 = make_clean_chunk(1600, start_val=0.0, end_val=0.50)
    detector.analyze(chunk0, sequence_number=0)

    # Chunk 5 arrives (packet gap of 4 packets), starting at -0.40 (step 0.90)
    chunk5 = make_clean_chunk(1600, start_val=-0.40, end_val=-0.30)
    res5 = detector.analyze(chunk5, sequence_number=5)

    assert res5.level == ManipulationLevel.NO_INDICATOR
    assert res5.discontinuity_score == 0.0
    assert any("Network packet gap detected" in exp for exp in res5.explainability)


def test_scenario_d_within_chunk_manipulation_active_during_gap():
    """Scenario D: Discontinuity occurring INSIDE received chunk is detected even when chunk arrives after a packet gap."""
    detector = AudioManipulationDetector()
    detector.reset()

    chunk0 = make_clean_chunk(1600, start_val=0.0, end_val=0.10)
    detector.analyze(chunk0, sequence_number=0)

    # Chunk 2 arrives with a sequence gap (seq 0 -> 2).
    # Inside chunk 2, an intentional splicing step occurs: sample 800 jumps by 0.85
    chunk2 = make_clean_chunk(1600, start_val=0.10, end_val=0.20)
    chunk2[800:] += 0.85  # internal step > 0.70

    res2 = detector.analyze(chunk2, sequence_number=2)

    # Boundary check was suppressed due to gap, BUT internal splicing was caught!
    assert res2.splicing_detected is True
    assert res2.level in (ManipulationLevel.MODERATE_INDICATOR, ManipulationLevel.STRONG_INDICATOR)
    assert any("Severe mid-frame amplitude impulse step" in ind for ind in res2.indicators)


def test_scenario_e_packet_repetition_active_during_gap():
    """Scenario E: Packet repetition within a chunk is detected even when arriving after a sequence gap."""
    detector = AudioManipulationDetector()
    detector.reset()

    chunk0 = make_clean_chunk(1600, start_val=0.0, end_val=0.10)
    detector.analyze(chunk0, sequence_number=0)

    # Chunk 3 arrives with gap (seq 0 -> 3), containing identical repeated blocks
    base_block = np.sin(np.linspace(0, 4 * np.pi, 800, dtype=np.float32)) * 0.3
    repeated_chunk = np.concatenate([base_block, base_block])

    res3 = detector.analyze(repeated_chunk, sequence_number=3)

    assert res3.packet_repetition_detected is True
    assert res3.level == ManipulationLevel.STRONG_INDICATOR
    assert any("Identical audio block repetition detected" in ind for ind in res3.indicators)


def test_scenario_f_subsequent_consecutive_chunk_recovers_boundary_check():
    """Scenario F: After a gap is suppressed (0 -> 2), the next consecutive chunk (2 -> 3) resumes boundary checking."""
    detector = AudioManipulationDetector()
    detector.reset()

    # 0. Initial chunk ending at 0.40
    chunk0 = make_clean_chunk(1600, start_val=0.0, end_val=0.40)
    detector.analyze(chunk0, sequence_number=0)

    # 1. Chunk 2 arrives after gap (0 -> 2), ends at 0.50. Boundary step is suppressed.
    chunk2 = make_clean_chunk(1600, start_val=-0.30, end_val=0.50)
    res2 = detector.analyze(chunk2, sequence_number=2)
    assert res2.discontinuity_score == 0.0

    # 2. Chunk 3 arrives consecutively (2 -> 3), starting at -0.40 (step = |-0.40 - 0.50| = 0.90 > 0.45)
    # Continuity is now restored; boundary checking MUST trigger!
    chunk3 = make_clean_chunk(1600, start_val=-0.40, end_val=-0.20)
    res3 = detector.analyze(chunk3, sequence_number=3)
    assert res3.discontinuity_score > 0.45
    assert res3.level == ManipulationLevel.MODERATE_INDICATOR
    assert any("discontinuity step" in ind for ind in res3.indicators)


def test_scenario_g_multi_session_isolation():
    """Scenario G: Concurrent sessions maintain distinct sequence and boundary states."""
    detector = AudioManipulationDetector()
    detector.reset()

    # Call A: seq 0 ends at +0.40
    chunkA0 = make_clean_chunk(1600, start_val=0.0, end_val=0.40)
    detector.analyze(chunkA0, sequence_number=0, session_id="call-A")

    # Call B: seq 0 ends at -0.40
    chunkB0 = make_clean_chunk(1600, start_val=0.0, end_val=-0.40)
    detector.analyze(chunkB0, sequence_number=0, session_id="call-B")

    # Call A: seq 1 arrives (consecutive for Call A, starting at -0.30 -> step 0.70)
    chunkA1 = make_clean_chunk(1600, start_val=-0.30, end_val=-0.20)
    resA1 = detector.analyze(chunkA1, sequence_number=1, session_id="call-A")
    assert resA1.level == ManipulationLevel.MODERATE_INDICATOR

    # Call B: seq 3 arrives (gap for Call B: 0 -> 3). Should be suppressed!
    chunkB3 = make_clean_chunk(1600, start_val=0.40, end_val=0.45)
    resB3 = detector.analyze(chunkB3, sequence_number=3, session_id="call-B")
    assert resB3.level == ManipulationLevel.NO_INDICATOR
    assert resB3.discontinuity_score == 0.0


def test_scenario_h_stream_pipeline_end_to_end_gap_suppression():
    """Scenario H: AudioStreamPipeline end-to-end integration verifies packet loss suppression via chunk_index."""
    pipeline = AudioStreamPipeline(target_sample_rate=16000)
    pipeline.manipulation.reset("stream-test-e2e")

    # Chunk 0
    raw0 = make_clean_chunk(1600, start_val=0.0, end_val=0.45)
    payload0 = AudioChunkPayload(
        call_id="call-e2e-1",
        stream_id="stream-test-e2e",
        chunk_index=0,
        audio_base64=make_pcm_base64_from_array(raw0),
    )
    res0 = pipeline.process_acoustic_intelligence(payload0)
    assert res0.manipulation.level == ManipulationLevel.NO_INDICATOR

    # Chunk 2 (chunk 1 lost) with boundary step |-0.40 - 0.45| = 0.85
    raw2 = make_clean_chunk(1600, start_val=-0.40, end_val=-0.20)
    payload2 = AudioChunkPayload(
        call_id="call-e2e-1",
        stream_id="stream-test-e2e",
        chunk_index=2,
        audio_base64=make_pcm_base64_from_array(raw2),
        metadata={"sequenceGap": True}
    )
    res2 = pipeline.process_acoustic_intelligence(payload2)
    assert res2.manipulation.level == ManipulationLevel.NO_INDICATOR
    assert res2.manipulation.discontinuity_score == 0.0
    assert any("Network packet gap detected" in exp for exp in res2.manipulation.explainability)


if __name__ == "__main__":
    tests = [
        test_scenario_a_consecutive_chunks_boundary_active,
        test_scenario_b_single_missing_packet_suppressed,
        test_scenario_c_multiple_missing_packets_suppressed,
        test_scenario_d_within_chunk_manipulation_active_during_gap,
        test_scenario_e_packet_repetition_active_during_gap,
        test_scenario_f_subsequent_consecutive_chunk_recovers_boundary_check,
        test_scenario_g_multi_session_isolation,
        test_scenario_h_stream_pipeline_end_to_end_gap_suppression,
    ]

    passed = 0
    for t in tests:
        try:
            t()
            passed += 1
            print(f"PASS: {t.__name__}")
        except Exception as e:
            print(f"FAIL: {t.__name__}: {e}")
            raise e

    print(f"\nSuccessfully passed all {passed}/{len(tests)} manipulation packet-loss tests.")
