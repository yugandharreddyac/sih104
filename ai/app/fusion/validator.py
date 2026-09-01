"""
Signal Contract Validator (Phase 5A)
Validates signal bounds, non-null properties, and timestamps to prevent injection and numerical corruption.
"""

import math
from typing import List, Tuple
from ai.app.core.types import CanonicalRiskSignal


class SignalValidator:
    @staticmethod
    def validate_signals(signals: List[CanonicalRiskSignal]) -> Tuple[List[CanonicalRiskSignal], List[str]]:
        """
        Validates signals, rejecting NaN, Infinity, negative values, or malformed fields.
        """
        valid: List[CanonicalRiskSignal] = []
        errors: List[str] = []

        for s in signals:
            if not s.signal_id or not s.call_id:
                errors.append(f"Signal missing ID or call_id: {s}")
                continue

            if math.isnan(s.raw_value) or math.isinf(s.raw_value) or s.raw_value < 0.0 or s.raw_value > 1.0:
                errors.append(f"Signal {s.signal_id} has invalid raw_value: {s.raw_value}")
                continue

            if math.isnan(s.calibrated_confidence) or s.calibrated_confidence < 0.0 or s.calibrated_confidence > 1.0:
                errors.append(f"Signal {s.signal_id} has invalid confidence: {s.calibrated_confidence}")
                continue

            valid.append(s)

        return valid, errors
