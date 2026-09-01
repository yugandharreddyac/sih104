"""
Evidence Graph & DAG Builder
Constructs directed acyclic graph linking multi-modal threat nodes with explicit relationship edges.
"""

import time
from typing import List, Dict, Tuple
from ai.app.core.types import (
    EvidenceGraph,
    EvidenceNode,
    EvidenceEdge,
    EvidenceRelationship,
    AcousticIntelligenceResult,
    ConversationalIntelligenceResult,
    DeepfakeStatus,
    SpeakerVerificationStatus,
    ReplayStatus,
    IntentCategory,
    ActionType
)


class EvidenceGraphBuilder:
    def build_graph(
        self,
        acoustic: AcousticIntelligenceResult,
        conversational: ConversationalIntelligenceResult,
        overall_score: float
    ) -> EvidenceGraph:
        """
        Compiles acoustic and conversational telemetry into an explainable Evidence DAG.
        """
        nodes: List[EvidenceNode] = []
        edges: List[EvidenceEdge] = []
        primary_findings: List[str] = []
        contradictions: List[str] = []
        now_ms = int(time.time() * 1000)

        # 1. Acoustic Nodes
        if acoustic.deepfake.status == DeepfakeStatus.SUSPICIOUS:
            n_df = EvidenceNode(
                node_id="node_deepfake",
                layer="Acoustic",
                cue=f"Synthetic voice artifacts detected (Spoof score: {acoustic.deepfake.spoof_score})",
                confidence=acoustic.deepfake.confidence or 0.85,
                is_adversarial=True,
                timestamp_ms=now_ms
            )
            nodes.append(n_df)
            primary_findings.append(n_df.cue)

        if acoustic.speaker.status == SpeakerVerificationStatus.MISMATCH:
            n_spk = EvidenceNode(
                node_id="node_speaker_mismatch",
                layer="Biometric",
                cue=f"Speaker vocal tract resonance contradicts claimed enrolled identity ({acoustic.speaker.similarity_score})",
                confidence=acoustic.speaker.confidence or 0.90,
                is_adversarial=True,
                timestamp_ms=now_ms
            )
            nodes.append(n_spk)
            primary_findings.append(n_spk.cue)

        if acoustic.replay.status == ReplayStatus.REPLAY:
            n_rp = EvidenceNode(
                node_id="node_replay",
                layer="Acoustic",
                cue="Loudspeaker acoustic roll-off and secondary room reverberation detected",
                confidence=acoustic.replay.confidence or 0.85,
                is_adversarial=True,
                timestamp_ms=now_ms
            )
            nodes.append(n_rp)
            primary_findings.append(n_rp.cue)

        # 2. Conversational & Behavioral Nodes
        if conversational.intent.is_adversarial:
            n_intent = EvidenceNode(
                node_id="node_intent",
                layer="Semantic",
                cue=f"Adversarial intent identified: {conversational.intent.primary_intent.value}",
                confidence=conversational.intent.confidence,
                is_adversarial=True,
                timestamp_ms=now_ms
            )
            nodes.append(n_intent)
            primary_findings.append(n_intent.cue)

        if conversational.sensitive_data.contains_direct_request:
            n_secret = EvidenceNode(
                node_id="node_secret_request",
                layer="SensitiveData",
                cue="Direct solicitation of authentication credentials / OTP [REDACTED]",
                confidence=0.95,
                is_adversarial=True,
                timestamp_ms=now_ms
            )
            nodes.append(n_secret)
            primary_findings.append(n_secret.cue)

        if conversational.social_engineering.attack_sequence_score >= 0.60:
            n_prog = EvidenceNode(
                node_id="node_attack_progression",
                layer="Behavioral",
                cue=f"Multi-turn sequence reached {conversational.social_engineering.progression_state.value}",
                confidence=conversational.social_engineering.confidence,
                is_adversarial=True,
                timestamp_ms=now_ms
            )
            nodes.append(n_prog)
            primary_findings.append(n_prog.cue)

        if conversational.requested_action.is_high_risk:
            n_act = EvidenceNode(
                node_id="node_action",
                layer="Action",
                cue=f"High-risk action instructed: {conversational.requested_action.target_object}",
                confidence=conversational.requested_action.confidence,
                is_adversarial=True,
                timestamp_ms=now_ms
            )
            nodes.append(n_act)
            primary_findings.append(n_act.cue)

        # 3. Inter-Node Corroboration & Escalation Edges
        node_ids = {n.node_id for n in nodes}

        if "node_speaker_mismatch" in node_ids and "node_intent" in node_ids:
            edges.append(EvidenceEdge(
                source_node_id="node_speaker_mismatch",
                target_node_id="node_intent",
                relationship=EvidenceRelationship.CORROBORATES,
                weight=1.5
            ))

        if "node_intent" in node_ids and "node_secret_request" in node_ids:
            edges.append(EvidenceEdge(
                source_node_id="node_intent",
                target_node_id="node_secret_request",
                relationship=EvidenceRelationship.CAUSES_ESCALATION,
                weight=1.8
            ))

        if "node_secret_request" in node_ids and "node_attack_progression" in node_ids:
            edges.append(EvidenceEdge(
                source_node_id="node_secret_request",
                target_node_id="node_attack_progression",
                relationship=EvidenceRelationship.SUPPORTS,
                weight=1.6
            ))

        # Check for contradictions
        if acoustic.deepfake.status == DeepfakeStatus.AUTHENTIC and conversational.intent.is_adversarial:
            contradictions.append("Acoustic voice is bona-fide human speech; threat is driven by conversational social engineering.")

        if not primary_findings:
            primary_findings.append("No active threat indicators detected; interaction is consistent with normal business dialogue.")

        return EvidenceGraph(
            nodes=nodes,
            edges=edges,
            primary_findings=primary_findings,
            contradictions=contradictions
        )
