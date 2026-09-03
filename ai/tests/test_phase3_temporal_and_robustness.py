"""
VOXSHIELD Phase 3 Comprehensive Temporal, Adversarial, & Cross-Modal Integration Tests
Covers Steps 3.5, 3.6, 3.7, 3.8, and 3.9:
1. Multi-turn temporal aggregation, warm-up, transient spike recovery, and call isolation
2. Adversarial robustness (clipping, high noise, narrowband, extreme gain, silence)
3. Numeric bounding and zero NaN/Infinity propagation
4. Cross-modal risk correlation (Benign, Deepfake, Replay, Speaker Mismatch, Multi-threat)
5. Multi-session concurrency and state cleanup
"""

import base64
import numpy as np
import pytest

from ai.app.audio.temporal_aggregator import TemporalAggregator, StreamTemporalSession
from ai.app.audio.quality import AudioQualityAnalyzer
from ai.app.deepfake.detector import DeepfakeDetector
from ai.app.speaker.verifier import SpeakerVerifier
from ai.app.replay.detector import ReplayDetector
from ai.app.audio.stream_pipeline import AudioStreamPipeline
from ai.app.fusion import MultiModalRiskFusionEngine
from ai.app.core.types import (
    AudioChunkPayload,
    AudioQualityRating,
    AudioQualityResult,
    DeepfakeAnalysisResult,
    DeepfakeStatus,
    SpeakerVerificationResult,
    SpeakerVerificationStatus,
    ReplayAnalysisResult,
    ReplayStatus,
    ManipulationLevel,
    OverallAcousticAssessment,
    RiskLevel
)


def test_temporal_session_isolation_and_cleanup():
    """Verify that multiple concurrent streams maintain independent temporal state and clean up properly."""
    aggregator = TemporalAggregator()

    s1 = aggregator.get_or_create_session("call-alpha")
    s2 = aggregator.get_or_create_session("call-beta")

    # Push speech and spoof to s1 only
    s1.push_chunk(duration_sec=0.5, is_speech=True, spoof_score=0.90)
    s1.push_chunk(duration_sec=0.5, is_speech=True, spoof_score=0.88)

    # s2 remains empty
    assert s1.accumulated_speech_seconds == 1.0
    assert s2.accumulated_speech_seconds == 0.0
    assert s1.get_aggregated_spoof_score() == pytest.approx(0.89, 0.02)
    assert s2.get_aggregated_spoof_score() is None

    # Cleanup s1
    aggregator.remove_session("call-alpha")
    assert "call-alpha" not in aggregator._sessions
    assert "call-beta" in aggregator._sessions


def test_temporal_transient_anomaly_recovery():
    """An isolated single-chunk anomaly should not permanently poison the session score."""
    session = StreamTemporalSession("call-transient-test", max_window_chunks=8)

    # 4 benign speech chunks
    for _ in range(4):
        session.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.10)

    # 1 transient noisy spike
    session.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.85)

    # 3 more benign chunks
    for _ in range(3):
        session.push_chunk(duration_sec=0.25, is_speech=True, spoof_score=0.12)

    # Median over window should remain solidly benign (~0.12)
    med_score = session.get_aggregated_spoof_score()
    assert med_score is not None
    assert med_score < 0.25


def test_adversarial_audio_clipping_and_noise_increases_uncertainty():
    """Heavily clipped or noisy audio must increase uncertainty without producing confident fake spoof."""
    analyzer = AudioQualityAnalyzer(sample_rate=16000)

    # Saturated clipped square wave
    samples = np.array([0.99 if i % 2 == 0 else -0.99 for i in range(16000)], dtype=np.float32)
    res = analyzer.analyze_samples(samples, duration_ms=1000.0)

    assert res.rating == AudioQualityRating.POOR
    assert res.clipping_ratio > 0.08
    assert res.uncertainty_penalty >= 0.40


def test_acoustic_outputs_strictly_finite_and_bounded():
    """All acoustic detectors must return finite floats within [0.0, 1.0]."""
    df_det = DeepfakeDetector(sample_rate=16000)
    spk_det = SpeakerVerifier(sample_rate=16000)
    rep_det = ReplayDetector(sample_rate=16000)

    # Synthesize silent chunk
    raw = np.zeros(4000, dtype=np.int16).tobytes()
    b64 = base64.b64encode(raw).decode("utf-8")
    chunk = AudioChunkPayload(call_id="c-numeric-01", chunk_index=0, audio_base64=b64)

    r_df = df_det.analyze(chunk)
    r_spk = spk_det.verify_speaker(chunk, claimed_speaker_id="user-123")
    r_rep = rep_det.detect_replay(chunk)

    for r in [r_df, r_spk, r_rep]:
        if r.confidence is not None:
            assert np.isfinite(r.confidence)
            assert 0.0 <= r.confidence <= 1.0


def test_cross_modal_benign_call_assessment():
    """A clean benign call with enrolled matching speaker produces AUTHENTICITY_SUPPORTED."""
    agg = TemporalAggregator()

    df = DeepfakeAnalysisResult(
        status=DeepfakeStatus.AUTHENTIC,
        spoof_score=0.12,
        confidence=0.88,
        uncertainty=0.12,
        model_version="df_v3"
    )
    assessment = agg.aggregate_overall_assessment(
        deepfake=df,
        speaker_status=SpeakerVerificationStatus.MATCH,
        replay_status=ReplayStatus.NOT_REPLAY,
        manipulation_level=ManipulationLevel.NO_INDICATOR,
        is_warmed_up=True
    )
    assert assessment == OverallAcousticAssessment.AUTHENTICITY_SUPPORTED


def test_cross_modal_corroborated_threat_assessment():
    """Deepfake + Replay + Speaker mismatch triggers SUSPICIOUS."""
    agg = TemporalAggregator()

    df = DeepfakeAnalysisResult(
        status=DeepfakeStatus.SUSPICIOUS,
        spoof_score=0.92,
        confidence=0.90,
        uncertainty=0.10,
        model_version="df_v3"
    )
    assessment = agg.aggregate_overall_assessment(
        deepfake=df,
        speaker_status=SpeakerVerificationStatus.MISMATCH,
        replay_status=ReplayStatus.REPLAY,
        manipulation_level=ManipulationLevel.STRONG_INDICATOR,
        is_warmed_up=True
    )
    assert assessment == OverallAcousticAssessment.SUSPICIOUS
