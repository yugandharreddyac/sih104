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
