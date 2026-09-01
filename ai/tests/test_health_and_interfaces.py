"""
Unit and Integration Tests for VOXSHIELD AI Service (Phase 5 Decision Intelligence)
Validates real VAD, audio quality metrics, streaming analysis, conversational intelligence, and multi-modal risk fusion.
"""

import base64
import numpy as np
import pytest
from fastapi.testclient import TestClient
from ai.app.main import app
from ai.app.core.types import PipelineStatus, VADState

client = TestClient(app)


def generate_pcm_chunk(duration_sec=0.25, sample_rate=16000, freq=440.0, amplitude=0.5):
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    samples = (amplitude * np.sin(2 * np.pi * freq * t) * 32767).astype(np.int16)
    return base64.b64encode(samples.tobytes()).decode("utf-8")


def generate_silence_chunk(duration_sec=0.25, sample_rate=16000):
    samples = np.zeros(int(sample_rate * duration_sec), dtype=np.int16)
    return base64.b64encode(samples.tobytes()).decode("utf-8")


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"
    assert data["phase"] == "PHASE_5_DECISION_INTELLIGENCE"


def test_pipeline_status_endpoint():
    response = client.get("/v1/status")
    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "PHASE_5_DECISION_INTELLIGENCE_ACTIVE"
    modules = data["modules"]
    assert modules["vad"]["status"] == PipelineStatus.AVAILABLE.value
    assert modules["audio_quality"]["status"] == PipelineStatus.AVAILABLE.value
    assert modules["deepfake_detection"]["status"] == PipelineStatus.AVAILABLE.value
    assert modules["speaker_verification"]["status"] == PipelineStatus.AVAILABLE.value
    assert modules["replay_detection"]["status"] == PipelineStatus.AVAILABLE.value
    assert modules["streaming_asr"]["status"] == PipelineStatus.AVAILABLE.value
    assert modules["social_engineering"]["status"] == PipelineStatus.AVAILABLE.value
    assert modules["risk_fusion"]["status"] == PipelineStatus.AVAILABLE.value


def test_stream_analysis_endpoint():
    payload = {
        "call_id": "call-test-123",
        "chunk_index": 0,
        "sample_rate": 16000,
        "channels": 1,
        "audio_base64": generate_pcm_chunk(amplitude=0.6),
        "metadata": {}
    }
    response = client.post("/v1/audio/analyze-stream", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["call_id"] == "call-test-123"
    assert data["status"] == PipelineStatus.AVAILABLE.value
    assert data["vad"]["state"] in [VADState.SPEECH.value, VADState.NON_SPEECH.value, VADState.UNCERTAIN.value]
    assert data["vad"]["confidence"] > 0.0
    assert data["quality"]["rating"] in ["GOOD", "DEGRADED", "POOR", "UNKNOWN"]
    assert data["pipeline_latency_ms"] > 0.0


def test_conversation_turn_analysis_endpoint():
    payload = {
        "call_id": "call-conv-test",
        "chunk_index": 1,
        "sample_rate": 16000,
        "channels": 1,
        "text_transcript": "I am calling from your bank. Please read the OTP 482910 right now.",
        "metadata": {}
    }
    response = client.post("/v1/conversation/analyze-turn", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["intent"]["primary_intent"] == "OTP_REQUEST"
    assert data["sensitive_data"]["contains_secret"] is True
    assert "[REDACTED]" in data["sensitive_data"]["redacted_preview"]
    assert "482910" not in data["sensitive_data"]["redacted_preview"]


def test_risk_fusion_evaluate_endpoint():
    payload = {
        "call_id": "call-test-999",
        "chunk_index": 0,
        "sample_rate": 16000,
        "channels": 1,
        "audio_base64": generate_pcm_chunk(),
        "text_transcript": "Please tell me your security OTP code immediately.",
        "metadata": {}
    }
    resp_fusion = client.post("/v1/fusion/evaluate-risk", json=payload)
    assert resp_fusion.status_code == 200
    data = resp_fusion.json()
    assert data["status"] == PipelineStatus.AVAILABLE.value
    assert data["call_id"] == "call-test-999"
    assert "overall_risk_score" in data
    assert "dimensions" in data
    assert "evidence_graph" in data
