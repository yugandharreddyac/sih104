"""
Evidence & Diagnostic Summary Compiler
Generates human-readable answers to the 8 core SOC diagnostic questions.
"""

from typing import List, Dict, Any
from ai.app.core.types import (
    EvidenceGraph,
    RiskDimensions,
    RiskLevel
)


class EvidenceCompiler:
    def compile_soc_diagnostic(
        self,
        risk_level: RiskLevel,
        overall_score: float,
        dimensions: RiskDimensions,
        graph: EvidenceGraph
    ) -> List[str]:
        """
        Compiles structural findings into concise, bulleted explanations for SOC display.
        """
        explanations: List[str] = []

        if overall_score >= 80.0:
            explanations.append(f"CRITICAL THREAT (Score: {overall_score:.1f}/100): High-confidence multi-modal attack pattern.")
        elif overall_score >= 60.0:
            explanations.append(f"HIGH RISK (Score: {overall_score:.1f}/100): Elevated security indicators require analyst attention.")
        elif overall_score >= 40.0:
            explanations.append(f"ELEVATED/GUARDED (Score: {overall_score:.1f}/100): Minor anomalies observed under ongoing monitoring.")
        else:
            explanations.append(f"SAFE/LOW (Score: {overall_score:.1f}/100): All acoustic and conversational metrics within normal bounds.")

        # Add top drivers from dimensions
        top_drivers = []
        if dimensions.credential_theft >= 70.0:
            top_drivers.append(f"Credential Harvesting ({dimensions.credential_theft:.0f}/100)")
        if dimensions.identity_impersonation >= 70.0:
            top_drivers.append(f"Identity Impersonation ({dimensions.identity_impersonation:.0f}/100)")
        if dimensions.social_engineering >= 70.0:
            top_drivers.append(f"Social Engineering Pressure ({dimensions.social_engineering:.0f}/100)")
        if dimensions.deepfake_synthetic >= 70.0:
            top_drivers.append(f"Synthetic Voice Clone ({dimensions.deepfake_synthetic:.0f}/100)")
        if dimensions.financial_fraud >= 70.0:
            top_drivers.append(f"Financial Fraud Risk ({dimensions.financial_fraud:.0f}/100)")

        if top_drivers:
            explanations.append("Key Threat Drivers: " + ", ".join(top_drivers))

        # Add primary findings from Evidence DAG
        for finding in graph.primary_findings[:4]:
            explanations.append(f"• {finding}")

        # Add contradictions if present
        for contra in graph.contradictions:
            explanations.append(f"Note: {contra}")

        return explanations
