"""
Action Risk Scorer Interface
Phase 1 Foundation: Operational and financial impact scoring interface.
"""

from typing import Dict, Any, Optional
from ai.app.core.types import PipelineStatus


class ActionRiskScorer:
    def __init__(self):
        self.model_version = "action_risk_v1_placeholder"
        self.status = PipelineStatus.NOT_AVAILABLE

    def score_action(self, action_type: str, action_details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Assesses inherent operational risk of requested action (e.g. Wire Transfer vs Address Change).
        Phase 1: Returns explicit NOT_AVAILABLE status without fake risk calculations.
        """
        return {
            "status": self.status.value,
            "model_version": self.model_version,
            "action_type": action_type,
            "risk_score": None,
            "phase_note": "Phase 1: Action risk interface ready for Phase 2 quantitative scoring."
        }
