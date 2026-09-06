"""
Unit and Integration Tests for Replay Temporal Smoothing & Multi-Turn Gating (Task 2.1)

Validates:
1. All genuine/live chunks remain stable (NOT_REPLAY).
2. Sustained replay evidence transitions to replay suspicion (LIKELY_REPLAY) then confirmed (REPLAY).
3. A single replay-like transient does not immediately force confirmed replay.
4. A single clean chunk does not immediately erase sustained replay evidence (hysteresis).
5. Recovery requires sustained clean observations (>= 3 chunks).
6. Alternating observations trigger UNCERTAIN without violent oscillation.
7. UNCERTAIN observations are handled safely (no manufactured confidence or scores).
8. Detector failures (MODEL_UNAVAILABLE) are handled safely without crashing.
9. Reset completely clears temporal state.
10. New session after reset does not inherit previous replay evidence.
11. Bounded history / O(1) memory.
12. Determinism: identical sequences yield identical results.
13. Privacy / Security: no raw audio, waveforms, or embeddings are stored.
14. Multi-session isolation via TemporalAggregator.
"""

import time
import pytest
import numpy as np

from ai.app.replay.temporal import ReplayTemporalTracker, ReplayObservation
from ai.app.audio.temporal_aggregator import TemporalAggregator, StreamTemporalSession
from ai.app.core.types import (
    ReplayAnalysisResult,
    ReplayStatus,
    AudioQualityResult,
    AudioQualityRating,
    DeepfakeAnalysisResult,
    DeepfakeStatus,
    SpeakerVerificationStatus,
    ManipulationLevel,
    OverallAcousticAssessment
)


def make_replay_result(
    status: ReplayStatus = ReplayStatus.NOT_REPLAY,
    score: float = 0.12,
    confidence: float = 0.82,
    hf_loss: bool = False,
    reverb_anomaly: bool = False,
    model_version: str = "replay_spectral_decay_v3"
) -> ReplayAnalysisResult:
    """Helper to create deterministic single-chunk ReplayAnalysisResult instances."""
    return ReplayAnalysisResult(
        status=status,
        replay_probability=score,
        confidence=confidence,
        high_frequency_loss=hf_loss,
        reverberation_decay_anomaly=reverb_anomaly,
        model_version=model_version,
        engine_type="DSP_FALLBACK",
        explainability=[f"Per-chunk observation: {status.value}"],
        inference_latency_ms=1.5
    )


def test_genuine_live_sequence_remains_stable():
    """All genuine/live chunks must remain stably NOT_REPLAY across consecutive frames."""
    tracker = ReplayTemporalTracker(window_size=8)
    clean_obs = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.82)

    for i in range(10):
        smoothed = tracker.process_observation(clean_obs)
        assert smoothed.status == ReplayStatus.NOT_REPLAY
        assert smoothed.replay_probability == pytest.approx(0.12, abs=0.01)
        assert smoothed.confidence >= 0.80
        assert smoothed.engine_type == "DSP_HEURISTIC_TEMPORAL"
        assert tracker.consecutive_clean_count == i + 1
        assert tracker.consecutive_replay_count == 0


def test_sustained_replay_transitions_to_suspicion_then_confirmed():
    """
    Sustained replay evidence must require consecutive corroboration:
    - Frame 1: LIKELY_REPLAY (suspicion, gated)
    - Frame 2+: REPLAY (confirmed)
    """
    tracker = ReplayTemporalTracker(window_size=8)
    replay_obs = make_replay_result(
        status=ReplayStatus.REPLAY,
        score=0.88,
        confidence=0.85,
        hf_loss=True,
        reverb_anomaly=True
    )

    # Frame 1: Replay suspicion (gated)
    s1 = tracker.process_observation(replay_obs)
    assert s1.status == ReplayStatus.LIKELY_REPLAY
    assert tracker.consecutive_replay_count == 1
    assert any("gating confirmed REPLAY" in exp for exp in s1.explainability)

    # Frame 2: Confirmed replay (2 consecutive chunks)
    s2 = tracker.process_observation(replay_obs)
    assert s2.status == ReplayStatus.REPLAY
    assert tracker.consecutive_replay_count == 2
    assert s2.replay_probability == pytest.approx(0.88, abs=0.01)
    assert s2.confidence >= 0.85
    assert s2.high_frequency_loss is True
    assert s2.reverberation_decay_anomaly is True
    assert any("Sustained replay evidence corroborated" in exp for exp in s2.explainability)

    # Frame 3: Remains confirmed REPLAY
    s3 = tracker.process_observation(replay_obs)
    assert s3.status == ReplayStatus.REPLAY
    assert tracker.consecutive_replay_count == 3


def test_single_transient_does_not_force_confirmed_replay():
    """An isolated single-frame replay spike amidst clean audio must NOT trigger confirmed REPLAY."""
    tracker = ReplayTemporalTracker(window_size=8)
    clean_obs = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.82)
    spike_obs = make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85, hf_loss=True)

    # 3 clean chunks
    for _ in range(3):
        tracker.process_observation(clean_obs)

    # 1 isolated replay spike
    s_spike = tracker.process_observation(spike_obs)
    assert s_spike.status != ReplayStatus.REPLAY
    assert s_spike.status == ReplayStatus.LIKELY_REPLAY  # Gated to suspicion, never confirmed
    assert tracker.consecutive_replay_count == 1

    # Following clean chunk immediately clears transient
    s_next = tracker.process_observation(clean_obs)
    assert s_next.status == ReplayStatus.NOT_REPLAY
    assert tracker.consecutive_clean_count == 1
    assert tracker.consecutive_replay_count == 0


def test_single_clean_chunk_does_not_erase_confirmed_replay():
    """An isolated clean chunk inside confirmed replay must NOT abruptly erase replay state (hysteresis)."""
    tracker = ReplayTemporalTracker(window_size=8)
    replay_obs = make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85, hf_loss=True)
    clean_obs = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.82)

    # Establish confirmed replay (2 chunks)
    tracker.process_observation(replay_obs)
    s2 = tracker.process_observation(replay_obs)
    assert s2.status == ReplayStatus.REPLAY

    # 1 momentary clean frame
    s_clean1 = tracker.process_observation(clean_obs)
    # Must NOT immediately drop to NOT_REPLAY
    assert s_clean1.status != ReplayStatus.NOT_REPLAY
    assert s_clean1.status == ReplayStatus.LIKELY_REPLAY
    assert any("Isolated clean observation" in exp for exp in s_clean1.explainability)

    # Subsequent replay frame immediately re-confirms
    s_rep3 = tracker.process_observation(replay_obs)
    assert s_rep3.status == ReplayStatus.LIKELY_REPLAY or s_rep3.status == ReplayStatus.REPLAY


def test_recovery_requires_sustained_clean_observations():
    """Returning from REPLAY to NOT_REPLAY requires at least 3 consecutive clean chunks."""
    tracker = ReplayTemporalTracker(window_size=8)
    replay_obs = make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85)
    clean_obs = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.82)

    # Establish confirmed replay
    tracker.process_observation(replay_obs)
    tracker.process_observation(replay_obs)
    assert tracker.current_state == ReplayStatus.REPLAY

    # Clean chunk 1: Demoted to suspicion, not cleared
    s_c1 = tracker.process_observation(clean_obs)
    assert s_c1.status == ReplayStatus.LIKELY_REPLAY

    # Clean chunk 2: Still in cooldown
    s_c2 = tracker.process_observation(clean_obs)
    assert s_c2.status == ReplayStatus.LIKELY_REPLAY

    # Clean chunk 3: Satisfies MIN_CONSECUTIVE_CLEAN_FOR_RESET (3) -> Clears to NOT_REPLAY
    s_c3 = tracker.process_observation(clean_obs)
    assert s_c3.status == ReplayStatus.NOT_REPLAY
    assert any("Sustained clean observations" in exp for exp in s_c3.explainability)


def test_alternating_observations_trigger_uncertain_instability():
    """Rapidly alternating observations (flapping) must trigger UNCERTAIN status."""
    tracker = ReplayTemporalTracker(window_size=8)
    rep = make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85)
    clean = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.82)

    # Alternate: rep, clean, rep, clean
    tracker.process_observation(rep)
    tracker.process_observation(clean)
    tracker.process_observation(rep)
    s4 = tracker.process_observation(clean)

    # 4 flips -> detected as alternating instability
    assert s4.status == ReplayStatus.UNCERTAIN
    assert any("Rapid alternating acoustic observations" in exp for exp in s4.explainability)
    assert s4.confidence <= 0.45


def test_uncertain_and_degraded_audio_handling():
    """
    Degraded or uncertain audio:
    - Does not manufacture confidence or fake scores.
    - Does not convert None to 0.0.
    - Does not create false positive replay alarm.
    - Sustained uncertainty (>= 3 chunks) transitions state to UNCERTAIN.
    """
    tracker = ReplayTemporalTracker(window_size=8)
    uncertain_obs = ReplayAnalysisResult(
        status=ReplayStatus.UNCERTAIN,
        replay_probability=None,
        confidence=0.0,
        high_frequency_loss=False,
        reverberation_decay_anomaly=False,
        model_version="replay_spectral_decay_v3",
        explainability=["[DSP_FALLBACK] Audio <250ms."]
    )

    # Initial chunk is uncertain
    s1 = tracker.process_observation(uncertain_obs)
    assert s1.status == ReplayStatus.UNCERTAIN
    assert s1.replay_probability is None
    assert s1.confidence == 0.0

    # Clean chunks establish live state
    clean_obs = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.82)
    tracker.process_observation(clean_obs)
    tracker.process_observation(clean_obs)

    # Transient uncertain chunk: confidence decays, does not manufacture replay
    s_unc = tracker.process_observation(uncertain_obs)
    assert s_unc.status in (ReplayStatus.NOT_REPLAY, ReplayStatus.UNCERTAIN)
    assert s_unc.status != ReplayStatus.REPLAY
    assert s_unc.status != ReplayStatus.LIKELY_REPLAY

    # Sustained uncertainty (3 consecutive) transitions state to UNCERTAIN
    tracker.process_observation(uncertain_obs)
    s_unc3 = tracker.process_observation(uncertain_obs)
    assert s_unc3.status == ReplayStatus.UNCERTAIN
    assert any("Sustained degraded/uncertain audio" in exp for exp in s_unc3.explainability)


def test_detector_failure_handled_safely():
    """Detector failure (MODEL_UNAVAILABLE) must be handled safely without exceptions or fake scores."""
    tracker = ReplayTemporalTracker(window_size=8)
    fail_obs = ReplayAnalysisResult(
        status=ReplayStatus.MODEL_UNAVAILABLE,
        replay_probability=None,
        confidence=0.0,
        high_frequency_loss=False,
        reverberation_decay_anomaly=False,
        model_version="replay_spectral_decay_v3",
        explainability=["Synthetic fault"]
    )

    s1 = tracker.process_observation(fail_obs)
    assert s1.status == ReplayStatus.MODEL_UNAVAILABLE
    assert s1.replay_probability is None
    assert s1.confidence == 0.0
    assert s1.engine_type == "DSP_HEURISTIC_TEMPORAL"


def test_reset_completely_clears_temporal_state():
    """Calling reset() must wipe all history, counters, and restore initial state."""
    tracker = ReplayTemporalTracker(window_size=8)
    rep = make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85)

    tracker.process_observation(rep)
    tracker.process_observation(rep)
    assert tracker.current_state == ReplayStatus.REPLAY
    assert tracker.consecutive_replay_count == 2
    assert tracker.history_length == 2

    tracker.reset()

    assert tracker.current_state == ReplayStatus.NOT_REPLAY
    assert tracker.consecutive_replay_count == 0
    assert tracker.consecutive_clean_count == 0
    assert tracker.consecutive_uncertain_count == 0
    assert tracker.history_length == 0
    assert tracker.get_smoothed_result() is None


def test_new_session_after_reset_does_not_inherit_evidence():
    """A new session following reset must start completely clean without prior replay bias."""
    tracker = ReplayTemporalTracker(window_size=8)
    rep = make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85)
    clean = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.82)

    # Session 1: confirmed replay
    tracker.process_observation(rep)
    tracker.process_observation(rep)
    assert tracker.current_state == ReplayStatus.REPLAY

    # Reset (simulating end of call / new speaker)
    tracker.reset()

    # Session 2: first clean chunk must evaluate as pure NOT_REPLAY
    s_new = tracker.process_observation(clean)
    assert s_new.status == ReplayStatus.NOT_REPLAY
    assert s_new.replay_probability == pytest.approx(0.12, abs=0.01)
    assert tracker.consecutive_clean_count == 1
    assert tracker.consecutive_replay_count == 0


def test_bounded_history_memory_o1():
    """History deque must never exceed window_size, guaranteeing strict O(1) memory bound."""
    tracker = ReplayTemporalTracker(window_size=6)
    clean = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.80)

    for _ in range(100):
        tracker.process_observation(clean)

    assert tracker.history_length == 6
    assert len(tracker._history) == 6


def test_determinism_identical_inputs_produce_identical_outputs():
    """Two independent tracker instances fed identical sequences must yield bitwise identical outputs."""
    t1 = ReplayTemporalTracker(window_size=8)
    t2 = ReplayTemporalTracker(window_size=8)

    sequence = [
        make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.80),
        make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85, hf_loss=True),
        make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85, hf_loss=True),
        make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.80),
        make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.80),
        make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.80),
    ]

    for obs in sequence:
        r1 = t1.process_observation(obs)
        r2 = t2.process_observation(obs)

        assert r1.status == r2.status
        assert r1.replay_probability == r2.replay_probability
        assert r1.confidence == r2.confidence
        assert r1.high_frequency_loss == r2.high_frequency_loss
        assert r1.reverberation_decay_anomaly == r2.reverberation_decay_anomaly
        assert r1.engine_type == r2.engine_type


def test_privacy_security_no_audio_or_embeddings_stored():
    """Verifies that ReplayTemporalTracker and ReplayObservation never store raw waveforms or embeddings."""
    tracker = ReplayTemporalTracker(window_size=8)
    obs = make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85)
    tracker.process_observation(obs)

    # Inspect all stored observation fields
    for o in tracker._history:
        assert isinstance(o, ReplayObservation)
        for field_name, val in o.__dict__.items():
            assert not isinstance(val, (np.ndarray, bytes)), f"Observation stores illegal binary data: {field_name}"
            if isinstance(val, str):
                # Ensure no Base64 audio or large data string is stored
                assert len(val) < 200, f"Observation stores suspiciously large string: {field_name}"


def test_stream_temporal_session_replay_integration():
    """StreamTemporalSession must correctly integrate ReplayTemporalTracker and track multi-chunk replay."""
    session = StreamTemporalSession("stream-rep-test-01", max_window_chunks=8)
    clean_rep = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.82)
    spike_rep = make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85)

    # Push 3 clean chunks
    for _ in range(3):
        session.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.10, replay_result=clean_rep)

    assert session.get_smoothed_replay().status == ReplayStatus.NOT_REPLAY

    # Push 1 spike chunk -> transient suspicion, not confirmed
    session.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.10, replay_result=spike_rep)
    assert session.get_smoothed_replay().status == ReplayStatus.LIKELY_REPLAY

    # Push 1 more replay chunk -> confirmed REPLAY
    session.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.10, replay_result=spike_rep)
    assert session.get_smoothed_replay().status == ReplayStatus.REPLAY


def test_temporal_aggregator_multi_session_isolation():
    """TemporalAggregator must maintain independent replay tracker states across concurrent sessions."""
    aggregator = TemporalAggregator()

    s1 = aggregator.get_or_create_session("call-rep-alpha")
    s2 = aggregator.get_or_create_session("call-rep-beta")

    rep = make_replay_result(status=ReplayStatus.REPLAY, score=0.88, confidence=0.85)
    clean = make_replay_result(status=ReplayStatus.NOT_REPLAY, score=0.12, confidence=0.82)

    # s1 receives confirmed replay
    s1.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.85, replay_result=rep)
    s1.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.85, replay_result=rep)

    # s2 receives clean voice
    s2.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.10, replay_result=clean)

    assert s1.get_smoothed_replay().status == ReplayStatus.REPLAY
    assert s2.get_smoothed_replay().status == ReplayStatus.NOT_REPLAY

    # Cleanup s1
    aggregator.remove_session("call-rep-alpha")
    assert "call-rep-alpha" not in aggregator._sessions
    assert "call-rep-beta" in aggregator._sessions
    # s2 state unchanged
    assert s2.get_smoothed_replay().status == ReplayStatus.NOT_REPLAY
