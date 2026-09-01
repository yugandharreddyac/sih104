"""
Context & Anomaly Engine Interface
Phase 1 Foundation: Baseline comparison interface.
"""

from typing import Dict, Any
from ai.app.core.types import PipelineStatus


class ContextAnalyzer:
    def __init__(self):
        self.model_version = "context_anomaly_v1_placeholder"
        self.status = PipelineStatus.NOT_AVAILABLE

    def evaluate_context(self, call_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates contextual anomalies (e.g. unexpected geographical origin, unusual time, new device).
        Phase 1: Returns explicit NOT_AVAILABLE status without fake anomaly scores.
        """
        return {
            "status": self.status.value,
            "model_version": self.model_version,
            "anomaly_detected": False,
            "anomaly_score": None,
            "phase_note": "Phase 1: Context anomaly interface ready for Phase 2 behavioral baseline integration."
        }
