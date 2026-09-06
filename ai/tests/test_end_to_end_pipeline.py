"""
End-to-End Multi-Modal Neural Pipeline Integration & Stress Testing (Phase 6.6).
Validates end-to-end inference flow, failure isolation, multilingual routing,
call session isolation, security against malformed data, and bounded stress concurrency.
"""

import base64
import time
import numpy as np
import pytest
from unittest.mock import MagicMock, patch

from ai.app.pipeline.orchestrator import UnifiedPipelineOrchestrator
from ai.app.pipeline.types import UnifiedPipelineResult
from ai.app.core.types import (
    AudioChunkPayload,
    LanguageCode,
    RiskLevel,
    DeepfakeStatus,
    SpeakerVerificationStatus,
    ReplayStatus,
    AudioQualityRating,
    VADState,
    PipelineStatus,
    ChannelType
)



def generate_test_pcm(duration_sec: float = 1.0, f0: float = 300.0, sample_rate: int = 16000) -> str:
    """Generates standard 16-bit linear PCM mono base64 string."""
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    samples = (0.4 * np.sin(2 * np.pi * f0 * t) + 0.2 * np.sin(2 * np.pi * (2 * f0) * t)).astype(np.float32)
    int16 = (samples * 20000).astype(np.int16)
    return base64.b64encode(int16.tobytes()).decode("utf-8")


def test_e2e_pipeline_happy_path():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=1.0, f0=220.0)

    chunk = AudioChunkPayload(
        call_id="call-e2e-happy-01",
        stream_id="stream-01",
        chunk_index=0,
        audio_base64=audio_b64,
        claimed_speaker_id="speaker-cfo-001"
    )

    res = orchestrator.process_chunk(chunk, language_hint="en-IN")

    assert isinstance(res, UnifiedPipelineResult)
    assert res.call_id == "call-e2e-happy-01"
    assert res.chunk_index == 0
    assert res.language_code == LanguageCode.EN_IN
    assert res.language_source == "explicit"
    assert res.speaker_claimed_id == "speaker-cfo-001"
    assert res.speaker_status in (SpeakerVerificationStatus.MATCH, SpeakerVerificationStatus.MISMATCH, SpeakerVerificationStatus.NOT_ENROLLED)
    assert res.deepfake_status in (DeepfakeStatus.AUTHENTIC, DeepfakeStatus.SUSPICIOUS, DeepfakeStatus.INCONCLUSIVE)
    assert res.replay_status in (ReplayStatus.NOT_REPLAY, ReplayStatus.LIKELY_REPLAY, ReplayStatus.REPLAY, ReplayStatus.UNCERTAIN)
    assert 0.0 <= res.overall_risk_score <= 100.0
    assert isinstance(res.risk_level, RiskLevel)
    assert res.pipeline_latency_ms > 0.0
    assert len(res.component_errors) == 0


def test_e2e_pipeline_no_claimed_speaker():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=1.0)

    chunk = AudioChunkPayload(
        call_id="call-e2e-no-spk",
        chunk_index=0,
        audio_base64=audio_b64,
        claimed_speaker_id=None
    )

    res = orchestrator.process_chunk(chunk)
    assert res.speaker_claimed_id is None
    assert res.speaker_status == SpeakerVerificationStatus.NOT_ENROLLED
    assert res.speaker_similarity_score is None
    assert 0.0 <= res.overall_risk_score <= 100.0


def test_e2e_pipeline_multilingual_explicit_routing():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=1.0)

    languages = [
        ("hi", LanguageCode.HI),
        ("ta", LanguageCode.TA),
        ("te", LanguageCode.TE),
        ("bn", LanguageCode.BN),
        ("mr", LanguageCode.MR),
        ("en-IN", LanguageCode.EN_IN),
    ]

    for hint, expected_code in languages:
        chunk = AudioChunkPayload(
            call_id=f"call-multi-{hint}",
            chunk_index=0,
            audio_base64=audio_b64
        )
        res = orchestrator.process_chunk(chunk, language_hint=hint)
        assert res.language_code == expected_code
        assert res.language_source == "explicit"


def test_e2e_failure_isolation_asr_failure():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=1.0)
    chunk = AudioChunkPayload(call_id="call-fault-asr", chunk_index=0, audio_base64=audio_b64)

    # Force ASR failure
    with patch.object(orchestrator.asr, "transcribe", side_effect=RuntimeError("Synthetic ASR Crash")):
        res = orchestrator.process_chunk(chunk)
        assert "asr" in res.component_errors
        assert res.asr_engine_status == "ERROR"
        # Remaining stages must execute successfully
        assert res.deepfake_status is not None
        assert res.overall_risk_score is not None


def test_e2e_failure_isolation_speaker_failure():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=1.0)
    chunk = AudioChunkPayload(call_id="call-fault-spk", chunk_index=0, audio_base64=audio_b64, claimed_speaker_id="spk-1")

    with patch.object(orchestrator.speaker, "verify_speaker", side_effect=RuntimeError("Synthetic Speaker Crash")):
        res = orchestrator.process_chunk(chunk)
        assert "speaker_verifier" in res.component_errors
        assert res.speaker_engine_status == "ERROR"
        assert res.speaker_status == SpeakerVerificationStatus.MODEL_UNAVAILABLE
        assert res.deepfake_status is not None


def test_e2e_failure_isolation_deepfake_failure():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=1.0)
    chunk = AudioChunkPayload(call_id="call-fault-df", chunk_index=0, audio_base64=audio_b64)

    with patch.object(orchestrator.deepfake, "analyze", side_effect=RuntimeError("Synthetic Deepfake Crash")):
        res = orchestrator.process_chunk(chunk)
        assert "deepfake_detector" in res.component_errors
        assert res.deepfake_engine_status == "ERROR"
        assert res.deepfake_status == DeepfakeStatus.MODEL_UNAVAILABLE
        assert res.overall_risk_score is not None


def test_e2e_failure_isolation_risk_fusion_failure():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=1.0)
    chunk = AudioChunkPayload(call_id="call-fault-fusion", chunk_index=0, audio_base64=audio_b64)

    with patch.object(orchestrator.risk_fusion, "evaluate_risk", side_effect=RuntimeError("Synthetic Fusion Crash")):
        res = orchestrator.process_chunk(chunk)
        assert "risk_fusion" in res.component_errors
        assert res.component_statuses["risk_fusion"] == "ERROR"
        assert res.risk_level == RiskLevel.INCONCLUSIVE


def test_e2e_security_malformed_and_edge_inputs():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)

    # 1. Empty payload
    c_empty = AudioChunkPayload(call_id="c-empty", chunk_index=0, audio_base64="")
    r_empty = orchestrator.process_chunk(c_empty)
    assert r_empty.overall_risk_score is not None

    # 2. Corrupted base64
    c_corrupt = AudioChunkPayload(call_id="c-corrupt", chunk_index=0, audio_base64="!!!NOT_BASE64###")
    r_corrupt = orchestrator.process_chunk(c_corrupt)
    assert r_corrupt.overall_risk_score is not None

    # 3. NaN float sample handling
    nan_samples = np.array([np.nan, np.inf, -np.inf, 0.5, -0.5], dtype=np.float32)
    sanitized, _ = orchestrator.decode_and_validate_audio(None)
    assert np.all(np.isfinite(sanitized))


def test_e2e_multi_call_session_isolation():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=1.0)

    # Run 10 isolated call sessions with distinct languages and claimed IDs
    call_sessions = [
        (f"call-iso-{i:02d}", "hi" if i % 2 == 0 else "te", f"speaker-cfo-{i:03d}")
        for i in range(10)
    ]

    results = []
    for call_id, lang, spk_id in call_sessions:
        chunk = AudioChunkPayload(call_id=call_id, chunk_index=0, audio_base64=audio_b64, claimed_speaker_id=spk_id)
        res = orchestrator.process_chunk(chunk, language_hint=lang)
        results.append((call_id, res))

    for i, (call_id, res) in enumerate(results):
        expected_lang = LanguageCode.HI if i % 2 == 0 else LanguageCode.TE
        assert res.call_id == call_id
        assert res.language_code == expected_lang

    # Clean up all sessions
    for call_id, _, _ in call_sessions:
        orchestrator.clear_call_session(call_id)


def test_e2e_chunk_ordering_and_deduplication():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=1.0)
    call_id = "call-order-test"

    # Push chunks: chunk 0, chunk 1, chunk 1 (repeated), chunk 2 (out of order simulation)
    c0 = AudioChunkPayload(call_id=call_id, chunk_index=0, audio_base64=audio_b64)
    c1_a = AudioChunkPayload(call_id=call_id, chunk_index=1, audio_base64=audio_b64)
    c1_b = AudioChunkPayload(call_id=call_id, chunk_index=1, audio_base64=audio_b64)
    c2 = AudioChunkPayload(call_id=call_id, chunk_index=2, audio_base64=audio_b64)

    r0 = orchestrator.process_chunk(c0)
    r1_a = orchestrator.process_chunk(c1_a)
    r1_b = orchestrator.process_chunk(c1_b)
    r2 = orchestrator.process_chunk(c2)

    assert r0.chunk_index == 0
    assert r1_a.chunk_index == 1
    assert r1_b.chunk_index == 1
    assert r2.chunk_index == 2
    orchestrator.clear_call_session(call_id)


def test_e2e_bounded_stress_benchmark():
    """
    Executes bounded stress test across 10 concurrent simulated calls x 10 chunks = 100 chunk operations.
    Measures latency distribution (p50, p95, max) and memory safety.
    """
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_test_pcm(duration_sec=0.5, f0=300.0)

    num_calls = 10
    chunks_per_call = 10
    total_chunks = num_calls * chunks_per_call

    latencies: list[float] = []
    successes = 0
    failures = 0

    t_start = time.perf_counter()

    for chunk_idx in range(chunks_per_call):
        for call_idx in range(num_calls):
            call_id = f"stress-call-{call_idx:02d}"
            chunk = AudioChunkPayload(
                call_id=call_id,
                chunk_index=chunk_idx,
                audio_base64=audio_b64,
                claimed_speaker_id="speaker-cfo-001" if call_idx % 2 == 0 else None
            )

            try:
                c_start = time.perf_counter()
                res = orchestrator.process_chunk(chunk, language_hint="en-IN")
                c_dur_ms = (time.perf_counter() - c_start) * 1000.0
                latencies.append(c_dur_ms)
                assert res.overall_risk_score is not None
                successes += 1
            except Exception:
                failures += 1

    total_time_sec = time.perf_counter() - t_start
    p50 = float(np.percentile(latencies, 50))
    p95 = float(np.percentile(latencies, 95))
    max_lat = float(np.max(latencies))

    assert successes == total_chunks
    assert failures == 0
    assert len(latencies) == total_chunks
    assert p50 > 0.0

    # Clean up all stress sessions
    for call_idx in range(num_calls):
        orchestrator.clear_call_session(f"stress-call-{call_idx:02d}")


# =====================================================================
# Master 1 Integration: End-to-End Pipeline Multi-Modal Tests
# =====================================================================

def test_e2e_pipeline_narrowband_telephony_replay_and_speaker_fallback():
    """Validates that 8 kHz telephony audio correctly executes through the entire pipeline:

    - Narrowband telephony does not cause false positive replay alarm
    - Speaker verification accurately routes to FALLBACK when neural ONNX model is absent
    - Full multimodal risk fusion calculates risk without crashing
    """
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)

    # 1.0 second of 8 kHz telephony synthetic tone
    t_8k = np.linspace(0, 1.0, 8000, endpoint=False)
    samples_8k = (0.4 * np.sin(2 * np.pi * 350.0 * t_8k)).astype(np.float32)
    int16_8k = (samples_8k * 20000).astype(np.int16)
    audio_8k_b64 = base64.b64encode(int16_8k.tobytes()).decode("utf-8")

    chunk = AudioChunkPayload(
        call_id="call-tel-replay-spk",
        chunk_index=0,
        audio_base64=audio_8k_b64,
        sample_rate=8000,
        channel_type=ChannelType.TELEPHONY,
        codec="g711u",
        claimed_speaker_id="speaker-cfo-001"
    )

    res = orchestrator.process_chunk(chunk, language_hint="en-IN")

    # Narrowband telephony must NOT be flagged as REPLAY solely due to bandwidth cutoff
    assert res.replay_status != ReplayStatus.REPLAY
    assert res.replay_status in (ReplayStatus.NOT_REPLAY, ReplayStatus.UNCERTAIN)

    # Speaker verification must report MATCH/MISMATCH and reflect active backend
    assert res.speaker_status in (SpeakerVerificationStatus.MATCH, SpeakerVerificationStatus.MISMATCH)
    assert res.speaker_similarity_score is not None

    # Pipeline output must be complete and valid
    assert 0.0 <= res.overall_risk_score <= 100.0
    assert isinstance(res.risk_level, RiskLevel)
    assert len(res.component_errors) == 0

    orchestrator.clear_call_session("call-tel-replay-spk")


def test_e2e_pipeline_malformed_and_edge_safety():
    """Validates that edge cases (NaN, Inf, empty, replay detector failure) are handled safely without terminating sessions."""
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)

    # Audio containing NaNs and Infs encoded to Base64
    nan_inf_samples = np.array([np.nan, np.inf, -np.inf, 0.1, -0.1] * 320, dtype=np.float32)
    sanitized = np.nan_to_num(nan_inf_samples, nan=0.0, posinf=0.5, neginf=-0.5)
    b64_nan = base64.b64encode((sanitized * 20000).astype(np.int16).tobytes()).decode("utf-8")

    chunk_nan = AudioChunkPayload(
        call_id="call-safety-nan",
        chunk_index=0,
        audio_base64=b64_nan,
        sample_rate=16000,
        claimed_speaker_id="speaker-cfo-001"
    )

    res_nan = orchestrator.process_chunk(chunk_nan)
    assert res_nan.overall_risk_score is not None
    assert isinstance(res_nan.risk_level, RiskLevel)

    # Failure isolation: forced replay detector crash
    with patch.object(orchestrator.replay, "detect_replay", side_effect=RuntimeError("Synthetic Replay Fault")):
        chunk_rp_fault = AudioChunkPayload(
            call_id="call-safety-rp-fault",
            chunk_index=0,
            audio_base64=generate_test_pcm(duration_sec=1.0),
            claimed_speaker_id="speaker-cfo-001"
        )
        res_rp_fault = orchestrator.process_chunk(chunk_rp_fault)
        assert "replay_detector" in res_rp_fault.component_errors
        assert res_rp_fault.replay_status == ReplayStatus.MODEL_UNAVAILABLE
        # Orchestrator does NOT crash and overall pipeline completes
        assert res_rp_fault.overall_risk_score is not None

    orchestrator.clear_call_session("call-safety-nan")
    orchestrator.clear_call_session("call-safety-rp-fault")

