"""
VOXSHIELD AI Service Type Definitions (Phase 5 Unified Multi-Modal Decision Layer)
Canonical types, 10-dimensional risk model, signal contracts, evidence graphs,
deterministic policy evaluation, step-up verification, and human-in-the-loop states.
"""

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class PipelineStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    LOADING = "LOADING"
    NOT_LOADED = "NOT_LOADED"
    NOT_AVAILABLE = "NOT_AVAILABLE"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    RULE_BASED = "RULE_BASED"
    ERROR = "ERROR"


class RiskLevel(str, Enum):
    SAFE = "SAFE"
    LOW = "LOW"
    GUARDED = "GUARDED"
    ELEVATED = "ELEVATED"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
    INCONCLUSIVE = "INCONCLUSIVE"


class RiskSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class VADState(str, Enum):
    SPEECH = "SPEECH"
    NON_SPEECH = "NON_SPEECH"
    UNCERTAIN = "UNCERTAIN"


class AudioQualityRating(str, Enum):
    GOOD = "GOOD"
    DEGRADED = "DEGRADED"
    POOR = "POOR"
    UNKNOWN = "UNKNOWN"


class ChannelType(str, Enum):
    WIDEBAND = "WIDEBAND"
    TELEPHONY = "TELEPHONY"
    AUTO = "AUTO"


class DeepfakeStatus(str, Enum):
    AUTHENTIC = "AUTHENTIC"
    SUSPICIOUS = "SUSPICIOUS"
    INCONCLUSIVE = "INCONCLUSIVE"
    INSUFFICIENT_AUDIO = "INSUFFICIENT_AUDIO"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"


class SpeakerVerificationStatus(str, Enum):
    MATCH = "MATCH"
    MISMATCH = "MISMATCH"
    NOT_ENROLLED = "NOT_ENROLLED"
    INSUFFICIENT_AUDIO = "INSUFFICIENT_AUDIO"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"


class ReplayStatus(str, Enum):
    REPLAY = "REPLAY"
    LIKELY_REPLAY = "LIKELY_REPLAY"
    NOT_REPLAY = "NOT_REPLAY"
    UNCERTAIN = "UNCERTAIN"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"


class ManipulationLevel(str, Enum):
    NO_INDICATOR = "NO_INDICATOR"
    WEAK_INDICATOR = "WEAK_INDICATOR"
    MODERATE_INDICATOR = "MODERATE_INDICATOR"
    STRONG_INDICATOR = "STRONG_INDICATOR"
    UNCERTAIN = "UNCERTAIN"


class OverallAcousticAssessment(str, Enum):
    AUTHENTICITY_SUPPORTED = "AUTHENTICITY_SUPPORTED"
    SUSPICIOUS = "SUSPICIOUS"
    INCONCLUSIVE = "INCONCLUSIVE"
    INSUFFICIENT_AUDIO = "INSUFFICIENT_AUDIO"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"


class LanguageCode(str, Enum):
    EN = "en"
    EN_IN = "en-IN"
    HI = "hi"
    TA = "ta"
    TE = "te"
    BN = "bn"
    MR = "mr"
    UNKNOWN = "unknown"
    UNSUPPORTED = "unsupported"


# --- Phase 5 Canonical Risk Signal Types ---

class SignalCategory(str, Enum):
    ACOUSTIC = "ACOUSTIC"
    IDENTITY = "IDENTITY"
    REPLAY = "REPLAY"
    MANIPULATION = "MANIPULATION"
    LANGUAGE = "LANGUAGE"
    INTENT = "INTENT"
    SENSITIVE_DATA = "SENSITIVE_DATA"
    SOCIAL_ENGINEERING = "SOCIAL_ENGINEERING"
    ACTION = "ACTION"
    CLAIMS = "CLAIMS"
    INCONSISTENCY = "INCONSISTENCY"
    CONTEXT = "CONTEXT"


class CanonicalRiskSignal(BaseModel):
    signal_id: str
    call_id: str
    source_phase: str
    category: SignalCategory
    signal_type: str
    raw_value: float = Field(..., ge=0.0, le=1.0)
    calibrated_confidence: float = Field(..., ge=0.0, le=1.0)
    quality_score: float = Field(1.0, ge=0.0, le=1.0)
    uncertainty_penalty: float = Field(0.0, ge=0.0, le=1.0)
    severity: RiskSeverity = RiskSeverity.LOW
    evidence_cues: List[str] = Field(default_factory=list)
    model_id: str
    timestamp_ms: int


# --- Phase 5 10-Dimensional Risk Model ---

class RiskDimensions(BaseModel):
    overall: float = Field(0.0, ge=0.0, le=100.0)
    identity_impersonation: float = Field(0.0, ge=0.0, le=100.0)
    deepfake_synthetic: float = Field(0.0, ge=0.0, le=100.0)
    replay_injection: float = Field(0.0, ge=0.0, le=100.0)
    social_engineering: float = Field(0.0, ge=0.0, le=100.0)
    credential_theft: float = Field(0.0, ge=0.0, le=100.0)
    financial_fraud: float = Field(0.0, ge=0.0, le=100.0)
    account_takeover: float = Field(0.0, ge=0.0, le=100.0)
    verification_bypass: float = Field(0.0, ge=0.0, le=100.0)
    inconsistency: float = Field(0.0, ge=0.0, le=100.0)


# --- Phase 5 Evidence Graph Types ---

class EvidenceRelationship(str, Enum):
    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    CORROBORATES = "CORROBORATES"
    CAUSES_ESCALATION = "CAUSES_ESCALATION"


class EvidenceNode(BaseModel):
    node_id: str
    layer: str  # "Acoustic", "Biometric", "Semantic", "Behavioral", "Policy"
    cue: str
    confidence: float
    is_adversarial: bool = False
    timestamp_ms: int


class EvidenceEdge(BaseModel):
    source_node_id: str
    target_node_id: str
    relationship: EvidenceRelationship
    weight: float = 1.0


class EvidenceGraph(BaseModel):
    nodes: List[EvidenceNode] = Field(default_factory=list)
    edges: List[EvidenceEdge] = Field(default_factory=list)
    primary_findings: List[str] = Field(default_factory=list)
    contradictions: List[str] = Field(default_factory=list)


# --- Phase 5 Policy & Human Workflow Types ---

class PolicyAction(str, Enum):
    NO_ACTION = "NO_ACTION"
    MONITOR = "MONITOR"
    WARN_ANALYST = "WARN_ANALYST"
    REQUIRE_STEP_UP_VERIFICATION = "REQUIRE_STEP_UP_VERIFICATION"
    RESTRICT_TRANSACTION = "RESTRICT_TRANSACTION"
    ESCALATE_TO_SUPERVISOR = "ESCALATE_TO_SUPERVISOR"
    TERMINATE_CALL = "TERMINATE_CALL"


class PolicyEvaluationResult(BaseModel):
    policy_id: str
    policy_name: str
    version: str
    priority: str
    is_triggered: bool
    recommended_action: PolicyAction
    requires_human_approval: bool
    matched_conditions: List[str] = Field(default_factory=list)
    explanation: str


class HumanDecisionState(str, Enum):
    AI_RECOMMENDED = "AI_RECOMMENDED"
    POLICY_APPROVED = "POLICY_APPROVED"
    AWAITING_HUMAN = "AWAITING_HUMAN"
    HUMAN_APPROVED = "HUMAN_APPROVED"
    HUMAN_OVERRIDDEN = "HUMAN_OVERRIDDEN"
    HUMAN_REJECTED = "HUMAN_REJECTED"
    EXECUTED = "EXECUTED"


class UnifiedRiskFusionResult(BaseModel):
    status: PipelineStatus = PipelineStatus.AVAILABLE
    call_id: str
    stream_id: Optional[str] = None
    turn_index: int = 0
    overall_risk_score: float = Field(0.0, ge=0.0, le=100.0)
    risk_level: RiskLevel = RiskLevel.SAFE
    confidence: float = Field(..., ge=0.0, le=1.0)
    uncertainty: float = Field(..., ge=0.0, le=1.0)
    dimensions: RiskDimensions
    risk_velocity: float = 0.0  # ΔRisk/sec
    risk_trajectory_trend: str = "STABLE"  # "ESCALATING", "STABLE", "DECAYING"
    primary_drivers: List[str] = Field(default_factory=list)
    contradicting_signals: List[str] = Field(default_factory=list)
    evidence_graph: EvidenceGraph
    policy_recommendation: Optional[PolicyEvaluationResult] = None
    human_workflow_state: HumanDecisionState = HumanDecisionState.AI_RECOMMENDED
    fusion_latency_ms: float = 0.0
    timestamp: str


# --- Phase 2/3/4 Retained Types ---

class IntentCategory(str, Enum):
    BENIGN_INQUIRY = "BENIGN_INQUIRY"
    IDENTITY_VERIFICATION = "IDENTITY_VERIFICATION"
    ACCOUNT_ACCESS = "ACCOUNT_ACCESS"
    PASSWORD_RESET = "PASSWORD_RESET"
    OTP_REQUEST = "OTP_REQUEST"
    CARD_INFORMATION_REQUEST = "CARD_INFORMATION_REQUEST"
    BANK_ACCOUNT_REQUEST = "BANK_ACCOUNT_REQUEST"
    PAYMENT_REQUEST = "PAYMENT_REQUEST"
    MONEY_TRANSFER_REQUEST = "MONEY_TRANSFER_REQUEST"
    CREDENTIAL_REQUEST = "CREDENTIAL_REQUEST"
    REMOTE_ACCESS_REQUEST = "REMOTE_ACCESS_REQUEST"
    SOFTWARE_INSTALLATION_REQUEST = "SOFTWARE_INSTALLATION_REQUEST"
    AUTHENTICATION_BYPASS = "AUTHENTICATION_BYPASS"
    EXECUTIVE_APPROVAL_REQUEST = "EXECUTIVE_APPROVAL_REQUEST"
    EMERGENCY_ACTION_REQUEST = "EMERGENCY_ACTION_REQUEST"
    CALLBACK_AVOIDANCE = "CALLBACK_AVOIDANCE"
    OTHER = "OTHER"


class IntentResult(BaseModel):
    primary_intent: IntentCategory
    confidence: float = Field(..., ge=0.0, le=1.0)
    secondary_intents: List[IntentCategory] = Field(default_factory=list)
    is_adversarial: bool = False
    evidence_cues: List[str] = Field(default_factory=list)


class SensitiveDataType(str, Enum):
    OTP = "OTP"
    PIN = "PIN"
    PASSWORD = "PASSWORD"
    CVV = "CVV"
    CREDIT_CARD = "CREDIT_CARD"
    BANK_ACCOUNT = "BANK_ACCOUNT"
    AADHAAR = "AADHAAR"
    PAN = "PAN"
    CONFIDENTIAL_CREDENTIAL = "CONFIDENTIAL_CREDENTIAL"


class SensitiveDataRole(str, Enum):
    BENIGN_MENTION = "BENIGN_MENTION"
    DIRECT_REQUEST = "DIRECT_REQUEST"
    READ_ALOUD = "READ_ALOUD"
    INSTRUCTION_TO_DISCLOSE = "INSTRUCTION_TO_DISCLOSE"
    VERIFICATION_BYPASS = "VERIFICATION_BYPASS"


class SensitiveDataFinding(BaseModel):
    entity_type: SensitiveDataType
    role: SensitiveDataRole
    raw_preview_sanitized: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: RiskSeverity = RiskSeverity.MEDIUM


class SensitiveDataResult(BaseModel):
    status: PipelineStatus = PipelineStatus.AVAILABLE
    findings: List[SensitiveDataFinding] = Field(default_factory=list)
    contains_direct_request: bool = False
    contains_secret: bool = False
    redacted_preview: str = ""
    highest_severity: RiskSeverity = RiskSeverity.LOW


class SocialEngineeringTactic(str, Enum):
    AUTHORITY_EXPLOITATION = "AUTHORITY_EXPLOITATION"
    URGENCY_PRESSURE = "URGENCY_PRESSURE"
    FEAR_COERCION = "FEAR_COERCION"
    SECRECY_DEMAND = "SECRECY_DEMAND"
    ISOLATION_ATTEMPT = "ISOLATION_ATTEMPT"
    TRUST_EXPLOITATION = "TRUST_EXPLOITATION"
    EMOTIONAL_MANIPULATION = "EMOTIONAL_MANIPULATION"
    VERIFICATION_BYPASS = "VERIFICATION_BYPASS"
    FINANCIAL_PRESSURE = "FINANCIAL_PRESSURE"


class AttackProgressionState(str, Enum):
    BENIGN_CONVERSATION = "BENIGN_CONVERSATION"
    AUTHORITY_ESTABLISHED = "AUTHORITY_ESTABLISHED"
    FEAR_URGENCY_INDUCED = "FEAR_URGENCY_INDUCED"
    AUTHENTICATION_BYPASS_ATTEMPTED = "AUTHENTICATION_BYPASS_ATTEMPTED"
    SECRET_HARVESTING_ATTEMPTED = "SECRET_HARVESTING_ATTEMPTED"
    CRITICAL_ACTION_EXPLOITATION = "CRITICAL_ACTION_EXPLOITATION"


class SocialEngineeringResult(BaseModel):
    status: PipelineStatus = PipelineStatus.AVAILABLE
    model_version: str = "social_eng_multi_turn_v4"
    tactics_detected: List[SocialEngineeringTactic] = Field(default_factory=list)
    progression_state: AttackProgressionState = AttackProgressionState.BENIGN_CONVERSATION
    attack_sequence_score: float = Field(0.0, ge=0.0, le=1.0)
    urgency_detected: bool = False
    authority_pressure: bool = False
    secrecy_demanded: bool = False
    fear_coercion_detected: bool = False
    verification_bypass_detected: bool = False
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    explainability: List[str] = Field(default_factory=list)


class ActionType(str, Enum):
    DISCLOSE_CREDENTIAL = "DISCLOSE_CREDENTIAL"
    TRANSFER_FUNDS = "TRANSFER_FUNDS"
    APPROVE_TRANSACTION = "APPROVE_TRANSACTION"
    INSTALL_REMOTE_SOFTWARE = "INSTALL_REMOTE_SOFTWARE"
    SHARE_SCREEN = "SHARE_SCREEN"
    CHANGE_BENEFICIARY = "CHANGE_BENEFICIARY"
    BYPASS_POLICY = "BYPASS_POLICY"
    BENIGN_ACTION = "BENIGN_ACTION"


class RequestedActionResult(BaseModel):
    action_type: ActionType
    target_object: str
    is_high_risk: bool = False
    confidence: float = Field(..., ge=0.0, le=1.0)
    raw_action_text_redacted: str


class CallerClaimType(str, Enum):
    BANK_OFFICIAL = "BANK_OFFICIAL"
    POLICE_LAW_ENFORCEMENT = "POLICE_LAW_ENFORCEMENT"
    IT_HELPDESK = "IT_HELPDESK"
    EXECUTIVE_CXO = "EXECUTIVE_CXO"
    FAMILY_MEMBER = "FAMILY_MEMBER"
    VENDOR_PARTNER = "VENDOR_PARTNER"
    UNKNOWN_CLAIM = "UNKNOWN_CLAIM"


class CallerClaim(BaseModel):
    claim_type: CallerClaimType
    claimed_identity: str
    organization: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    stated_turn_index: int


class ConversationPhase(str, Enum):
    GREETING = "GREETING"
    IDENTITY_ESTABLISHMENT = "IDENTITY_ESTABLISHMENT"
    INQUIRY = "INQUIRY"
    ACTION_REQUEST = "ACTION_REQUEST"
    VERIFICATION_PHASE = "VERIFICATION_PHASE"
    CLOSING = "CLOSING"


class ConversationTurn(BaseModel):
    turn_index: int
    speaker_channel: int
    transcript: str
    redacted_transcript: str
    timestamp_ms: int
    intent: Optional[IntentCategory] = None
    tactics: List[SocialEngineeringTactic] = Field(default_factory=list)
    sensitive_findings: List[SensitiveDataFinding] = Field(default_factory=list)


class TranscriptSegment(BaseModel):
    segment_id: str
    speaker_channel: int = 0
    text: str
    redacted_text: str
    start_ms: int
    end_ms: int
    confidence: float = Field(..., ge=0.0, le=1.0)
    language: LanguageCode = LanguageCode.EN
    is_final: bool = True


class ASRResult(BaseModel):
    status: PipelineStatus = PipelineStatus.AVAILABLE
    model_version: str = "whisper_streaming_conformer_v4"
    transcript: str = ""
    redacted_transcript: str = ""
    language: LanguageCode = LanguageCode.EN
    language_confidence: float = 1.0
    segments: List[TranscriptSegment] = Field(default_factory=list)
    word_count: int = 0
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    uncertainty: float = Field(0.0, ge=0.0, le=1.0)
    is_final: bool = True
    inference_latency_ms: float = 0.0


class ConversationalIntelligenceResult(BaseModel):
    call_id: str
    stream_id: Optional[str] = None
    turn_index: int
    timestamp: str
    asr: ASRResult
    intent: IntentResult
    sensitive_data: SensitiveDataResult
    social_engineering: SocialEngineeringResult
    requested_action: RequestedActionResult
    caller_claims: List[CallerClaim] = Field(default_factory=list)
    inconsistencies: List[str] = Field(default_factory=list)
    current_phase: ConversationPhase = ConversationPhase.INQUIRY
    total_nlp_latency_ms: float = 0.0
    evidence_summary: List[str] = Field(default_factory=list)


class VADResult(BaseModel):
    state: VADState
    speech_probability: float = Field(..., ge=0.0, le=1.0)
    energy_rms: float
    zero_crossing_rate: float
    spectral_centroid: float
    confidence: float = Field(..., ge=0.0, le=1.0)
    processing_latency_ms: float


class AudioQualityResult(BaseModel):
    rating: AudioQualityRating
    rms_dbfs: float
    peak_amplitude: float
    clipping_ratio: float = Field(..., ge=0.0, le=1.0)
    silence_ratio: float = Field(..., ge=0.0, le=1.0)
    snr_estimate_db: float
    dynamic_range_db: float
    sample_rate: int
    channels: int
    duration_ms: float
    uncertainty_penalty: float = Field(..., ge=0.0, le=1.0)
    notes: str
    spectral_bandwidth_hz: Optional[float] = None
    high_frequency_ratio: Optional[float] = None


class DeepfakeAnalysisResult(BaseModel):
    status: DeepfakeStatus
    spoof_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    uncertainty: float = Field(0.0, ge=0.0, le=1.0)
    spectral_flatness_anomaly: bool = False
    vocoder_distortion_score: float = 0.0
    lfcc_anomaly_score: float = 0.0
    artifacts_detected: List[str] = Field(default_factory=list)
    model_version: str
    engine_type: Optional[str] = None
    explainability: List[str] = Field(default_factory=list)
    inference_latency_ms: float = 0.0
    channel_type_applied: ChannelType = ChannelType.WIDEBAND
    threshold_applied: float = 0.685


class SpeakerVerificationResult(BaseModel):
    status: SpeakerVerificationStatus
    similarity_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    is_enrolled: bool = False
    enrolled_speaker_id: Optional[str] = None
    threshold_applied: float = 0.72
    model_version: str
    engine_type: Optional[str] = None
    explainability: List[str] = Field(default_factory=list)
    inference_latency_ms: float = 0.0


class ReplayAnalysisResult(BaseModel):
    status: ReplayStatus
    replay_probability: Optional[float] = Field(None, ge=0.0, le=1.0)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    high_frequency_loss: bool = False
    reverberation_decay_anomaly: bool = False
    model_version: str
    engine_type: Optional[str] = "DSP"
    explainability: List[str] = Field(default_factory=list)
    inference_latency_ms: float = 0.0


class ManipulationAnalysisResult(BaseModel):
    level: ManipulationLevel
    discontinuity_score: float = 0.0
    splicing_detected: bool = False
    packet_repetition_detected: bool = False
    indicators: List[str] = Field(default_factory=list)
    explainability: List[str] = Field(default_factory=list)


class TemporalAggregationMetrics(BaseModel):
    window_duration_seconds: float
    accumulated_speech_seconds: float
    total_chunks_processed: int
    is_warmed_up: bool
    stability_confidence: float


class AcousticIntelligenceResult(BaseModel):
    call_id: str
    stream_id: Optional[str] = None
    chunk_index: int
    timestamp: str
    overall_assessment: OverallAcousticAssessment
    deepfake: DeepfakeAnalysisResult
    speaker: SpeakerVerificationResult
    replay: ReplayAnalysisResult
    manipulation: ManipulationAnalysisResult
    vad: VADResult
    quality: AudioQualityResult
    temporal_metrics: TemporalAggregationMetrics
    total_ai_latency_ms: float
    evidence_summary: List[str] = Field(default_factory=list)


class SpeakerEnrollmentRequest(BaseModel):
    speaker_id: str
    speaker_name: str
    audio_utterances_base64: List[str]
    sample_rate: int = 16000
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SpeakerProfile(BaseModel):
    speaker_id: str
    speaker_name: str
    embedding_dimension: int
    utterances_count: int
    enrolled_at: str
    anti_spoof_verified: bool
    audio_quality_rating: str
    is_active: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AudioChunkPayload(BaseModel):
    call_id: str
    stream_id: Optional[str] = None
    chunk_index: int
    sample_rate: int = 16000
    channels: int = 1
    format: str = "pcm_s16le"
    audio_base64: Optional[str] = None
    text_transcript: Optional[str] = None
    speaker_channel: int = 0
    timestamp_ms: Optional[int] = None
    claimed_speaker_id: Optional[str] = None
    channel_type: Optional[ChannelType] = None
    codec: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AudioAnalysisEvent(BaseModel):
    call_id: str
    stream_id: Optional[str] = None
    chunk_index: int
    timestamp: str
    status: PipelineStatus = PipelineStatus.AVAILABLE
    vad: VADResult
    quality: AudioQualityResult
    pipeline_latency_ms: float
    metadata: Dict[str, Any] = Field(default_factory=dict)
