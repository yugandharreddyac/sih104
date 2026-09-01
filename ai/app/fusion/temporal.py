"""
Temporal Risk Engine & Velocity Tracker (Phase 5C)
Tracks risk trajectory, escalation rate (ΔRisk/sec), and rolling window stability over active call turns.
"""

import time
from typing import Dict, List, Tuple
from collections import deque


class CallRiskSnapshot:
    def __init__(self, score: float, timestamp_sec: float):
        self.score = score
        self.timestamp_sec = timestamp_sec


class TemporalRiskEngine:
    def __init__(self, max_history_turns: int = 20):
        self.max_history = max_history_turns
        self._history: Dict[str, deque] = {}

    def track_risk(self, call_id: str, current_score: float) -> Tuple[float, str]:
        """
        Updates call temporal risk history and returns (risk_velocity, trajectory_trend).
        """
        now = time.time()
        if call_id not in self._history:
            self._history[call_id] = deque(maxlen=self.max_history)

        q = self._history[call_id]
        q.append(CallRiskSnapshot(current_score, now))

        if len(q) < 2:
            return 0.0, "STABLE"

        first = q[0]
        last = q[-1]
        dt = max(1.0, last.timestamp_sec - first.timestamp_sec)
        d_score = last.score - first.score

        velocity = round(d_score / dt, 2)

        if velocity > 5.0:
            trend = "ESCALATING"
        elif velocity < -3.0:
            trend = "DECAYING"
        else:
            trend = "STABLE"

        return velocity, trend

    def clear_session(self, call_id: str):
        if call_id in self._history:
            del self._history[call_id]
