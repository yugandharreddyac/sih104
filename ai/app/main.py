"""
VOXSHIELD AI Service Application Entrypoint (FastAPI)
Phase 4: Streaming ASR, Conversational Intelligence, Intent Taxonomy,
Sensitive Data Gating, Social Engineering Detection, and Multi-Turn Attack Analysis.
"""

from typing import List
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from ai.app.core.config import settings
from ai.app.core.types import (
    AudioChunkPayload,
    AudioAnalysisEvent,
    AcousticIntelligenceResult,
    ConversationalIntelligenceResult,
    DeepfakeAnalysisResult,
    SpeakerVerificationResult,
    ReplayAnalysisResult,
    SpeakerEnrollmentRequest,
    SpeakerProfile,
    ASRResult,
    SocialEngineeringResult,
    UnifiedRiskFusionResult,
    PipelineStatus
)
from ai.app.core.model_registry import ModelRegistry, ModelMetadata
from ai.app.audio.stream_pipeline import AudioStreamPipeline
from ai.app.conversation.memory import ConversationMemoryManager
from ai.app.fusion.engine import MultiModalRiskFusionEngine

app = FastAPI(
    title="VOXSHIELD AI Service",
    description="Real-time multi-modal voice security, conversational intelligence, ASR, and fraud prevention AI engine",
    version=settings.SERVICE_VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate engine interfaces
stream_pipeline = AudioStreamPipeline(target_sample_rate=16000)
fusion_engine = MultiModalRiskFusionEngine()


@app.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """Service health check endpoint."""
    return {
        "status": "HEALTHY",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "environment": settings.ENVIRONMENT,
        "phase": "PHASE_5_DECISION_INTELLIGENCE"
    }


@app.get("/v1/models", response_model=List[ModelMetadata])
def list_models():
    """Returns registered acoustic & NLP models with SHA-256 integrity checksums and status."""
    return ModelRegistry.list_models()


@app.get("/v1/status", status_code=status.HTTP_200_OK)
def get_pipeline_status():
    """
    Returns the real-time operational status of all AI pipeline modules.
    Phase 5: VAD, Audio Quality, Deepfake, Speaker, Replay, ASR, Social Engineering, and Unified Risk Fusion are all AVAILABLE.
    """
    return {
        "overall_status": "PHASE_5_DECISION_INTELLIGENCE_ACTIVE",
        "modules": {
            "vad": {
                "status": stream_pipeline.vad.status.value,
                "model": stream_pipeline.vad.model_version,
                "note": "Phase 5: Multi-feature energy, ZCR, and spectral centroid VAD active."
            },
            "audio_quality": {
                "status": PipelineStatus.AVAILABLE.value,
                "model": stream_pipeline.quality.model_version,
                "note": "Phase 5: Signal health, RMS dBFS, clipping ratio, and SNR analyzer active."
            },
            "deepfake_detection": {
                "status": stream_pipeline.deepfake.status.value,
                "model": stream_pipeline.deepfake.model_id,
                "note": "Phase 5: Robustness-Augmented MiniAcousticCNN spectral & LFCC artifact detector active with DSP fallback."
            },
            "speaker_verification": {
                "status": stream_pipeline.speaker.status.value,
                "model": stream_pipeline.speaker.model_id,
                "note": "Phase 5: 128-dim x-vector acoustic biometric verification active."
            },
            "replay_detection": {
                "status": stream_pipeline.replay.status.value,
                "model": stream_pipeline.replay.model_id,
                "note": "Phase 5: High-frequency roll-off & acoustic reverberation detector active."
            },
            "streaming_asr": {
                "status": stream_pipeline.asr.status.value,
                "model": stream_pipeline.asr.model_version,
                "note": "Phase 5: Streaming multilingual ASR active (EN, HI, TE)."
            },
            "social_engineering": {
                "status": stream_pipeline.social_eng_detector.status.value,
                "model": stream_pipeline.social_eng_detector.model_version,
                "note": "Phase 5: Behavioral tactics & multi-turn attack sequence state machine active."
            },
            "intent_classification": {
                "status": PipelineStatus.AVAILABLE.value,
                "model": "intent_classifier_multi_token_v4",
                "note": "Phase 4: Contextual multi-token intent classifier active."
            },
            "sensitive_data_gating": {
                "status": PipelineStatus.AVAILABLE.value,
                "model": "deterministic_redactor_gating_v4",
                "note": "Phase 4: In-memory situational role classifier and privacy redactor active."
            },
            "risk_fusion": {
                "status": fusion_engine.status.value,
                "model": fusion_engine.model_id,
                "note": "Phase 5: Unified 10-dimensional multi-modal risk fusion & evidence graph engine active."
            }
        },
        "phase_note": "Phase 5: Decision intelligence, deterministic policies, and multi-modal risk fusion live."
    }


# Phase 4 Conversational Intelligence Endpoints
@app.post("/v1/conversation/analyze-turn", response_model=ConversationalIntelligenceResult)
def analyze_conversation_turn(payload: AudioChunkPayload):
    """
    Analyzes conversation turn: executes ASR, Intent Classification, Sensitive Data Redaction,
    Social Engineering Tactics, Requested Action Extraction, and Multi-Turn Sequence Escalation.
    """
    return stream_pipeline.process_conversational_intelligence(payload)


@app.get("/v1/conversation/{call_id}/summary")
def get_conversation_summary(call_id: str):
    """Returns bounded conversation turn history and memory summary (redacted)."""
    memory = ConversationMemoryManager.get(call_id)
    if not memory:
        return {"call_id": call_id, "total_turns": 0, "turns": [], "transcript": ""}
    return {
        "call_id": call_id,
        "total_turns": len(memory.turns),
        "turns": list(memory.turns),
        "transcript_redacted": memory.get_full_transcript_text(redacted=True)
    }


@app.delete("/v1/conversation/{call_id}")
def clear_conversation_memory(call_id: str):
    """Purges in-memory conversation history for privacy compliance."""
    ConversationMemoryManager.remove(call_id)
    return {"success": True, "message": f"Conversation memory for '{call_id}' cleared."}


# Phase 3 Acoustic Intelligence Endpoints
@app.post("/v1/acoustic/analyze", response_model=AcousticIntelligenceResult)
def analyze_acoustic_intelligence(payload: AudioChunkPayload):
    return stream_pipeline.process_acoustic_intelligence(payload)


@app.post("/v1/audio/analyze-stream", response_model=AudioAnalysisEvent)
def analyze_stream_legacy(payload: AudioChunkPayload):
    return stream_pipeline.process_chunk(payload)


# Speaker Biometric Enrollment Endpoints
@app.post("/v1/speaker/enroll", status_code=status.HTTP_201_CREATED)
def enroll_speaker(req: SpeakerEnrollmentRequest):
    success, profile, message = stream_pipeline.speaker.enrollment_manager.enroll_speaker(req)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    return {"success": True, "message": message, "profile": profile}


@app.get("/v1/speakers", response_model=List[SpeakerProfile])
def list_enrolled_speakers():
    return stream_pipeline.speaker.enrollment_manager.list_profiles()


@app.get("/v1/speaker/{speaker_id}", response_model=SpeakerProfile)
def get_enrolled_speaker(speaker_id: str):
    profile = stream_pipeline.speaker.enrollment_manager.get_profile(speaker_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Speaker '{speaker_id}' not found.")
    return profile


@app.delete("/v1/speaker/{speaker_id}", status_code=status.HTTP_200_OK)
def delete_enrolled_speaker(speaker_id: str):
    deleted = stream_pipeline.speaker.enrollment_manager.delete_profile(speaker_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Speaker '{speaker_id}' not found.")
    return {"success": True, "message": f"Biometric profile for '{speaker_id}' deleted successfully."}


@app.post("/v1/audio/analyze-deepfake", response_model=DeepfakeAnalysisResult)
def analyze_deepfake(payload: AudioChunkPayload):
    return stream_pipeline.deepfake.analyze(payload)


@app.post("/v1/audio/verify-speaker", response_model=SpeakerVerificationResult)
def verify_speaker(payload: AudioChunkPayload, claimed_speaker_id: str = None):
    return stream_pipeline.speaker.verify_speaker(payload, claimed_speaker_id=claimed_speaker_id)


@app.post("/v1/audio/detect-replay", response_model=ReplayAnalysisResult)
def detect_replay(payload: AudioChunkPayload):
    return stream_pipeline.replay.detect_replay(payload)


@app.post("/v1/audio/transcribe", response_model=ASRResult)
def transcribe_audio(payload: AudioChunkPayload):
    return stream_pipeline.asr.transcribe(payload)


@app.post("/v1/nlp/social-engineering", response_model=SocialEngineeringResult)
def analyze_social_engineering(text_transcript: str):
    return stream_pipeline.social_eng_detector.analyze_tactics(text_transcript)


@app.post("/v1/fusion/evaluate-risk", response_model=UnifiedRiskFusionResult)
def evaluate_risk(payload: AudioChunkPayload):
    # Execute stream pipeline acoustic analysis
    acoustic_res = stream_pipeline.process_acoustic_intelligence(payload)
    # Execute conversational analysis
    conv_res = stream_pipeline.process_conversational_intelligence(payload)
    # Execute unified multi-modal risk fusion
    return fusion_engine.evaluate_risk(
        call_id=payload.call_id,
        acoustic=acoustic_res,
        conversational=conv_res,
        stream_id=payload.stream_id,
        turn_index=payload.chunk_index
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("ai.app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
