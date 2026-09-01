"""
Unified Multi-Modal Cross-Risk Fusion & Policy Decision Engine (Phase 5)
Orchestrates Canonical Signal Normalization, 10-Dimensional Fusion Matrix,
Temporal Dynamics, Evidence Graph Construction, and Policy Evaluation.
"""

import time
from datetime import datetime, timezone
from typing import Optional, List

from ai.app.core.types import (
    PipelineStatus,
    UnifiedRiskFusionResult,
    RiskDimensions,
    RiskLevel,
    AcousticIntelligenceResult,
    ConversationalIntelligenceResult,
    PolicyEvaluationResult,
    PolicyAction,
    HumanDecisionState
)
from ai.app.core.model_registry import ModelRegistry
from ai.app.fusion.signal_contract import CanonicalSignalBus
from ai.app.fusion.validator import SignalValidator
from ai.app.fusion.matrix import RiskMatrixCalculator
from ai.app.fusion.temporal import TemporalRiskEngine
from ai.app.evidence.graph import EvidenceGraphBuilder
from ai.app.evidence.compiler import EvidenceCompiler


class MultiModalRiskFusionEngine:
    def __init__(self):
        self.model_id = "unified_risk_fusion_v5"
        self.signal_bus = CanonicalSignalBus()
        self.matrix_calculator = RiskMatrixCalculator()
        self.temporal_engine = TemporalRiskEngine()
        self.graph_builder = EvidenceGraphBuilder()
        self.compiler = EvidenceCompiler()

        model_meta = ModelRegistry.get_model(self.model_id)
        self.status = model_meta.status if model_meta else PipelineStatus.AVAILABLE

    def evaluate_risk(
        self,
        call_id: str,
        acoustic: Optional[AcousticIntelligenceResult] = None,
        conversational: Optional[ConversationalIntelligenceResult] = None,
        stream_id: Optional[str] = None,
        turn_index: int = 0
    ) -> UnifiedRiskFusionResult:
        """
        Executes unified multi-modal risk fusion across acoustic and conversational telemetry.
        """
        start_time = time.perf_counter()
        now_iso = datetime.now(timezone.utc).isoformat()

        if self.status != PipelineStatus.AVAILABLE:
            return UnifiedRiskFusionResult(
                status=PipelineStatus.MODEL_UNAVAILABLE,
                call_id=call_id,
                stream_id=stream_id,
                turn_index=turn_index,
                overall_risk_score=0.0,
                risk_level=RiskLevel.INCONCLUSIVE,
                confidence=0.0,
                uncertainty=1.0,
                dimensions=RiskDimensions(),
                risk_velocity=0.0,
                risk_trajectory_trend="STABLE",
                primary_drivers=["Risk Fusion Engine is currently UNAVAILABLE in Model Registry."],
                evidence_graph=self.graph_builder.build_graph(acoustic, conversational, 0.0) if (acoustic and conversational) else None,
                policy_recommendation=None,
                human_workflow_state=HumanDecisionState.AI_RECOMMENDED,
                fusion_latency_ms=0.0,
                timestamp=now_iso
            )

        # 1. Ingest and normalize canonical signals
        raw_signals = self.signal_bus.normalize_signals(call_id, acoustic, conversational)
        valid_signals, val_errors = SignalValidator.validate_signals(raw_signals)

        # 2. Compute 10-dimensional matrix, overall score, confidence, uncertainty
        dimensions, overall_score, confidence, uncertainty = self.matrix_calculator.compute_dimensions(valid_signals)
        risk_level = self.matrix_calculator.classify_risk_level(overall_score, confidence)

        # 3. Temporal velocity and trajectory tracking
        velocity, trend = self.temporal_engine.track_risk(call_id, overall_score)

        # 4. Build Evidence Graph DAG
        if acoustic and conversational:
            evidence_graph = self.graph_builder.build_graph(acoustic, conversational, overall_score)
        else:
            # Fallback graph if one modality is degraded
            dummy_ac = acoustic or AcousticIntelligenceResult(
                call_id=call_id, chunk_index=0, timestamp=now_iso,
                overall_assessment="INCONCLUSIVE",
                deepfake={"status": "INCONCLUSIVE", "model_version": "v3"},
                speaker={"status": "NOT_ENROLLED", "model_version": "v3"},
                replay={"status": "UNCERTAIN", "model_version": "v3"},
                manipulation={"level": "NO_INDICATOR"},
                vad={"state": "UNCERTAIN", "speech_probability": 0.5, "energy_rms": 0.0, "zero_crossing_rate": 0.0, "spectral_centroid": 0.0, "confidence": 0.5, "processing_latency_ms": 0.0},
                quality={"rating": "UNKNOWN", "rms_dbfs": 0.0, "peak_amplitude": 0.0, "clipping_ratio": 0.0, "silence_ratio": 0.0, "snr_estimate_db": 0.0, "dynamic_range_db": 0.0, "sample_rate": 16000, "channels": 1, "duration_ms": 0.0, "uncertainty_penalty": 0.0, "notes": ""},
                temporal_metrics={"window_duration_seconds": 0.0, "accumulated_speech_seconds": 0.0, "total_chunks_processed": 0, "is_warmed_up": False, "stability_confidence": 0.0},
                total_ai_latency_ms=0.0
            )
            dummy_cv = conversational or ConversationalIntelligenceResult(
                call_id=call_id, turn_index=0, timestamp=now_iso,
                asr={"status": "AVAILABLE", "confidence": 0.9, "uncertainty": 0.1},
                intent={"primary_intent": "BENIGN_INQUIRY", "confidence": 0.9},
                sensitive_data={"status": "AVAILABLE"},
                social_engineering={"status": "AVAILABLE"},
                requested_action={"action_type": "BENIGN_ACTION", "target_object": "", "confidence": 0.9, "raw_action_text_redacted": ""},
                total_nlp_latency_ms=0.0
            )
            evidence_graph = self.graph_builder.build_graph(dummy_ac, dummy_cv, overall_score)

        # 5. Compile diagnostic explanations
        primary_drivers = self.compiler.compile_soc_diagnostic(risk_level, overall_score, dimensions, evidence_graph)

        # 6. Advisory Policy Recommendation
        policy_rec: Optional[PolicyEvaluationResult] = None
        if dimensions.credential_theft >= 75.0 or (conversational and conversational.sensitive_data.contains_direct_request):
            policy_rec = PolicyEvaluationResult(
                policy_id="POL-CRED-001",
                policy_name="Enforce Out-of-Band Step-Up on Credential Harvesting",
                version="1.2.0",
                priority="CRITICAL_CREDENTIAL_DEFENSE",
                is_triggered=True,
                recommended_action=PolicyAction.REQUIRE_STEP_UP_VERIFICATION,
                requires_human_approval=True,
                matched_conditions=["intent == OTP_REQUEST", "risk.credential_theft >= 75.0"],
                explanation="Policy POL-CRED-001 triggered: High-confidence credential solicitation detected under active social engineering pressure."
            )
        elif dimensions.financial_fraud >= 70.0:
            policy_rec = PolicyEvaluationResult(
                policy_id="POL-FIN-002",
                policy_name="Hold High-Value Transaction on Unverified Identity",
                version="1.1.0",
                priority="FINANCIAL_ASSET_PROTECTION",
                is_triggered=True,
                recommended_action=PolicyAction.RESTRICT_TRANSACTION,
                requires_human_approval=True,
                matched_conditions=["intent == MONEY_TRANSFER_REQUEST", "risk.financial_fraud >= 70.0"],
                explanation="Policy POL-FIN-002 triggered: Unverified party requested high-risk financial transfer."
            )
        elif risk_level in [RiskLevel.HIGH, RiskLevel.CRITICAL]:
            policy_rec = PolicyEvaluationResult(
                policy_id="POL-GEN-003",
                policy_name="SOC Analyst Warning on Elevated Risk",
                version="1.0.0",
                priority="STANDARD_MONITORING",
                is_triggered=True,
                recommended_action=PolicyAction.WARN_ANALYST,
                requires_human_approval=False,
                matched_conditions=["risk_level >= HIGH"],
                explanation="Policy POL-GEN-003 triggered: Multi-modal threat indicators exceeded acceptable risk threshold."
            )

        latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        return UnifiedRiskFusionResult(
            status=PipelineStatus.AVAILABLE,
            call_id=call_id,
            stream_id=stream_id,
            turn_index=turn_index,
            overall_risk_score=overall_score,
            risk_level=risk_level,
            confidence=confidence,
            uncertainty=uncertainty,
            dimensions=dimensions,
            risk_velocity=velocity,
            risk_trajectory_trend=trend,
            primary_drivers=primary_drivers,
            contradicting_signals=evidence_graph.contradictions,
            evidence_graph=evidence_graph,
            policy_recommendation=policy_rec,
            human_workflow_state=HumanDecisionState.AI_RECOMMENDED,
            fusion_latency_ms=latency_ms,
            timestamp=now_iso
        )
