"""
Temporal Acoustic Aggregation & Stability Engine (Phase 3)
Buffers rolling analysis window (1.0 to 3.0 seconds), enforces warm-up periods,
and stabilizes confidence against transient single-frame fluctuations.
"""

from collections import deque
from typing import Dict, List, Optional
import numpy as np

from ai.app.core.types import (
    DeepfakeAnalysisResult,
    DeepfakeStatus,
    TemporalAggregationMetrics,
    VADState,
    OverallAcousticAssessment,
    SpeakerVerificationStatus,
    ReplayStatus,
    ManipulationLevel
)


class StreamTemporalSession:
    def __init__(self, stream_id: str, max_window_chunks: int = 12):
        self.stream_id = stream_id
        self.max_window_chunks = max_window_chunks
        self.chunk_history: deque = deque(maxlen=max_window_chunks)
        self.spoof_scores: deque = deque(maxlen=max_window_chunks)
        self.accumulated_speech_seconds = 0.0
        self.total_chunks_processed = 0

    def push_chunk(
        self,
        duration_sec: float,
        is_speech: bool,
        spoof_score: Optional[float]
    ):
        self.total_chunks_processed += 1
        if is_speech:
            self.accumulated_speech_seconds += duration_sec

        if spoof_score is not None and is_speech:
            self.spoof_scores.append(spoof_score)

    def get_aggregated_spoof_score(self) -> Optional[float]:
        if not self.spoof_scores:
            return None
        # Median across speech window
        return float(np.median(list(self.spoof_scores)))

    def get_metrics(self) -> TemporalAggregationMetrics:
        is_warmed_up = self.accumulated_speech_seconds >= 0.60
        # Confidence increases as accumulated speech window grows up to 2.5s
        stability_conf = min(1.0, self.accumulated_speech_seconds / 2.0)
        return TemporalAggregationMetrics(
            window_duration_seconds=round(len(self.chunk_history) * 0.25, 2),
            accumulated_speech_seconds=round(self.accumulated_speech_seconds, 2),
            total_chunks_processed=self.total_chunks_processed,
            is_warmed_up=is_warmed_up,
            stability_confidence=round(stability_conf, 2)
        )


class TemporalAggregator:
    def __init__(self):
        self._sessions: Dict[str, StreamTemporalSession] = {}

    def get_or_create_session(self, stream_id: str) -> StreamTemporalSession:
        if stream_id not in self._sessions:
            self._sessions[stream_id] = StreamTemporalSession(stream_id)
        return self._sessions[stream_id]

    def remove_session(self, stream_id: str):
        if stream_id in self._sessions:
            del self._sessions[stream_id]

    def aggregate_overall_assessment(
        self,
        deepfake: DeepfakeAnalysisResult,
        speaker_status: SpeakerVerificationStatus,
        replay_status: ReplayStatus,
        manipulation_level: ManipulationLevel,
        is_warmed_up: bool
    ) -> OverallAcousticAssessment:
        """
        Determines overall acoustic assessment from multi-model acoustic indicators.
        """
        if not is_warmed_up:
            return OverallAcousticAssessment.INSUFFICIENT_AUDIO

        if (
            deepfake.status == DeepfakeStatus.MODEL_UNAVAILABLE and
            speaker_status == SpeakerVerificationStatus.MODEL_UNAVAILABLE and
            replay_status == ReplayStatus.MODEL_UNAVAILABLE
        ):
            return OverallAcousticAssessment.MODEL_UNAVAILABLE

        # Any high acoustic spoof indicator triggers SUSPICIOUS
        if (
            deepfake.status == DeepfakeStatus.SUSPICIOUS or
            speaker_status == SpeakerVerificationStatus.MISMATCH or
            replay_status == ReplayStatus.REPLAY or
            manipulation_level == ManipulationLevel.STRONG_INDICATOR
        ):
            return OverallAcousticAssessment.SUSPICIOUS

        # If evidence is inconclusive or poor quality
        if deepfake.status == DeepfakeStatus.INCONCLUSIVE or replay_status == ReplayStatus.UNCERTAIN:
            return OverallAcousticAssessment.INCONCLUSIVE

        # When models indicate authentic voice
        if deepfake.status == DeepfakeStatus.AUTHENTIC:
            return OverallAcousticAssessment.AUTHENTICITY_SUPPORTED

        return OverallAcousticAssessment.INCONCLUSIVE
