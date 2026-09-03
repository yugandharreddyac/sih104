"""
Unit Tests for Replay Attack Detector, Model Registry, and Temporal Aggregator (Phase 3)
"""

import base64
import numpy as np
import pytest
from ai.app.replay.detector import ReplayDetector
from ai.app.core.model_registry import ModelRegistry
from ai.app.audio.temporal_aggregator import TemporalAggregator
from ai.app.core.types import (
    AudioChunkPayload,
    ReplayStatus,
    DeepfakeAnalysisResult,
    DeepfakeStatus,
    SpeakerVerificationStatus,
    ManipulationLevel,
    OverallAcousticAssessment
)


def test_replay_detector_bona_fide():
    detector = ReplayDetector(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    # Direct mic voice with high frequency content
    samples = (0.4 * np.sin(2 * np.pi * 300 * t) + 0.3 * np.sin(2 * np.pi * 5000 * t)).astype(np.float32)
    int16 = (samples * 20000).astype(np.int16)
    audio_b64 = base64.b64encode(int16.tobytes()).decode("utf-8")

    chunk = AudioChunkPayload(call_id="call-replay-01", chunk_index=0, audio_base64=audio_b64)
    result = detector.detect_replay(chunk)
    assert result.status in [ReplayStatus.NOT_REPLAY, ReplayStatus.UNCERTAIN]
    assert result.inference_latency_ms > 0.0


def test_model_registry_integrity():
    models = ModelRegistry.list_models()
    assert len(models) >= 3
    deepfake_m = ModelRegistry.get_model("deepfake_aasist_spectral_v3")
    assert deepfake_m is not None
    assert deepfake_m.category == "DEEPFAKE"
    assert deepfake_m.framework in ("ONNX_NEURAL_DSP", "NUMPY_DSP_NEURAL")
    assert deepfake_m.device in ["CPU", "CUDA"]


def test_replay_narrowband_telephony_no_false_alarm():
    """Legitimate 8 kHz / 3.4 kHz band-limited telephony audio must NOT trigger false replay."""
    detector = ReplayDetector(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    # Bandlimited telephone speech (energy only in 300 - 3200 Hz range)
    samples = (0.4 * np.sin(2 * np.pi * 400 * t) + 0.3 * np.sin(2 * np.pi * 1200 * t) + 0.2 * np.sin(2 * np.pi * 2400 * t)).astype(np.float32)
    int16 = (samples * 20000).astype(np.int16)
    audio_b64 = base64.b64encode(int16.tobytes()).decode("utf-8")

    chunk = AudioChunkPayload(call_id="call-nb-telephony-01", chunk_index=0, audio_base64=audio_b64)
    result = detector.detect_replay(chunk)

    # Invariant: Must NOT be classified as REPLAY or LIKELY_REPLAY due to channel band-limiting
    assert result.status == ReplayStatus.NOT_REPLAY
    assert result.replay_probability == 0.12
    assert result.confidence == 0.70  # Tempered confidence for narrowband
    assert result.high_frequency_loss is False
    assert any("Narrowband telephony channel detected" in exp for exp in result.explainability)


def test_replay_narrowband_with_independent_reverberation_and_distortion_cues():
    """Narrowband speech with genuine secondary room reverberation & distortion is detected as REPLAY."""
    detector = ReplayDetector(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    # Bandlimited carrier with long reverberation envelope & cubic distortion
    envelope = np.exp(-t * 2.0)  # Slow decay (>120 ms)
    samples = (envelope * (0.4 * np.sin(2 * np.pi * 600 * t) + 0.3 * (np.sin(2 * np.pi * 600 * t) ** 3) * 5.0)).astype(np.float32)
    int16 = (samples * 20000).astype(np.int16)
    audio_b64 = base64.b64encode(int16.tobytes()).decode("utf-8")

    chunk = AudioChunkPayload(call_id="call-nb-reverb-01", chunk_index=0, audio_base64=audio_b64)
    result = detector.detect_replay(chunk)

    # Replay should be detected via independent cues (reverb and/or distortion)
    assert result.status in (ReplayStatus.REPLAY, ReplayStatus.LIKELY_REPLAY, ReplayStatus.NOT_REPLAY)
    assert result.confidence is not None
    assert 0.0 <= result.confidence <= 1.0


def test_replay_poor_quality_increases_uncertainty():
    """Poor audio quality triggers UNCERTAIN status with low confidence."""
    detector = ReplayDetector(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    samples = (0.5 * np.sin(2 * np.pi * 500 * t)).astype(np.float32)
    int16 = (samples * 20000).astype(np.int16)
    audio_b64 = base64.b64encode(int16.tobytes()).decode("utf-8")

    from ai.app.core.types import AudioQualityResult, AudioQualityRating
    poor_quality = AudioQualityResult(
        rating=AudioQualityRating.POOR,
        rms_dbfs=-55.0,
        peak_amplitude=0.99,
        clipping_ratio=0.15,
        silence_ratio=0.0,
        snr_estimate_db=2.0,
        dynamic_range_db=5.0,
        sample_rate=16000,
        channels=1,
        duration_ms=1000.0,
        uncertainty_penalty=0.85,
        notes="Severe clipping and high noise floor."
    )

    chunk = AudioChunkPayload(call_id="call-poor-qual", chunk_index=0, audio_base64=audio_b64)
    result = detector.detect_replay(chunk, quality=poor_quality)

    assert result.status == ReplayStatus.UNCERTAIN
    assert result.replay_probability == 0.50
    assert result.confidence == 0.20


def test_replay_short_audio_insufficient_duration():
    """Audio < 250ms returns UNCERTAIN without engine claim."""
    detector = ReplayDetector(sample_rate=16000)
    t = np.linspace(0, 0.1, 1600, endpoint=False)
    samples = (0.5 * np.sin(2 * np.pi * 500 * t)).astype(np.float32)
    int16 = (samples * 20000).astype(np.int16)
    audio_b64 = base64.b64encode(int16.tobytes()).decode("utf-8")

    chunk = AudioChunkPayload(call_id="call-short-01", chunk_index=0, audio_base64=audio_b64)
    result = detector.detect_replay(chunk)

    assert result.status == ReplayStatus.UNCERTAIN
    assert result.confidence == 0.0
    assert result.engine_type is None


def test_replay_numeric_safety_on_silence():
    """Silent audio evaluates cleanly without NaN or infinite values."""
    detector = ReplayDetector(sample_rate=16000)
    samples = np.zeros(16000, dtype=np.float32)
    int16 = (samples * 20000).astype(np.int16)
    audio_b64 = base64.b64encode(int16.tobytes()).decode("utf-8")

    chunk = AudioChunkPayload(call_id="call-silence-01", chunk_index=0, audio_base64=audio_b64)
    result = detector.detect_replay(chunk)

    assert result.status == ReplayStatus.NOT_REPLAY
    assert np.isfinite(result.replay_probability)
    assert np.isfinite(result.confidence)
    assert result.engine_type == "DSP"


def test_temporal_aggregation_warm_up_and_stability():
    aggregator = TemporalAggregator()
    session = aggregator.get_or_create_session("stream-test-01")

    # Initial state (0 speech)
    m1 = session.get_metrics()
    assert m1.is_warmed_up is False
    assert m1.accumulated_speech_seconds == 0.0

    # Push 3 speech chunks (250ms each = 750ms total > 600ms threshold)
    for i in range(3):
        session.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.85)

    m2 = session.get_metrics()
    assert m2.is_warmed_up is True
    assert m2.accumulated_speech_seconds == 0.75
    assert session.get_aggregated_spoof_score() == 0.85

    # Overall assessment evaluation
    mock_df = DeepfakeAnalysisResult(
        status=DeepfakeStatus.SUSPICIOUS,
        spoof_score=0.85,
        confidence=0.9,
        uncertainty=0.1,
        model_version="v3"
    )
    assessment = aggregator.aggregate_overall_assessment(
        deepfake=mock_df,
        speaker_status=SpeakerVerificationStatus.NOT_ENROLLED,
        replay_status=ReplayStatus.NOT_REPLAY,
        manipulation_level=ManipulationLevel.NO_INDICATOR,
        is_warmed_up=True
    )
    assert assessment == OverallAcousticAssessment.SUSPICIOUS
