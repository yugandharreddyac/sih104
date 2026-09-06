"""
Temporal Replay Smoothing & Multi-Turn Gating Engine (Phase 2 - Task 2.1)

Provides deterministic temporal aggregation and hysteresis across consecutive
audio chunk replay observations to stabilize physical replay decisions over time.

Classification Provance:
    DSP / HEURISTIC TEMPORAL AGGREGATION
    (Not a trained, calibrated, or scientific machine learning probability model).
"""

import time
from collections import deque
from dataclasses import dataclass
from typing import Optional, List
import numpy as np

from ai.app.core.types import (
    ReplayAnalysisResult,
    ReplayStatus,
    AudioQualityResult,
    AudioQualityRating
)


@dataclass(frozen=True)
class ReplayObservation:
    """
    Lightweight, privacy-preserving observation container.
    Stores only minimal numeric metrics and categorical flags.
    NEVER stores raw audio waveforms, samples, transcripts, or embeddings.
    """
    raw_probability: Optional[float]
    status: ReplayStatus
    confidence: Optional[float]
    high_frequency_loss: bool
    reverberation_decay_anomaly: bool
    is_speech: bool
    is_valid: bool
    modulation_anomaly: bool = False
    cepstral_anomaly: bool = False


class ReplayTemporalTracker:
    """
    Deterministic temporal aggregator with hysteresis gating for physical replay detection.

    Hysteresis Engineering Heuristics:
      - Confirmed REPLAY requires at least 2 consecutive replay observations (prevents
        single-frame transients or room reflection spikes from forcing false alarms).
      - Recovery from REPLAY back to NOT_REPLAY requires at least 3 consecutive clean
        observations (prevents momentary clean frames from masking ongoing attacks).
      - Rapid alternating observations trigger UNCERTAIN status due to temporal instability.
      - Persistent UNCERTAIN observations (>= 3 chunks) decay confidence and transition to
        UNCERTAIN, preventing stale replay state from persisting indefinitely.
      - Fixed bounded history (default 8 chunks) ensures strict O(1) memory bound.
    """

    # Conservative engineering hysteresis thresholds
    MIN_CONSECUTIVE_REPLAY_FOR_CONFIRMATION: int = 2
    MIN_CONSECUTIVE_CLEAN_FOR_RESET: int = 3
    MAX_CONSECUTIVE_UNCERTAIN_FOR_DECAY: int = 3

    def __init__(self, window_size: int = 8):
        self.window_size = max(4, min(32, window_size))
        self._history: deque[ReplayObservation] = deque(maxlen=self.window_size)
        self._current_state: ReplayStatus = ReplayStatus.NOT_REPLAY
        self._consecutive_replay_count: int = 0
        self._consecutive_clean_count: int = 0
        self._consecutive_uncertain_count: int = 0
        self._total_processed: int = 0
        self._confirmed_replay_active: bool = False
        self._last_result: Optional[ReplayAnalysisResult] = None

    @property
    def current_state(self) -> ReplayStatus:
        return self._current_state

    @property
    def consecutive_replay_count(self) -> int:
        return self._consecutive_replay_count

    @property
    def consecutive_clean_count(self) -> int:
        return self._consecutive_clean_count

    @property
    def consecutive_uncertain_count(self) -> int:
        return self._consecutive_uncertain_count

    @property
    def history_length(self) -> int:
        return len(self._history)

    def reset(self) -> None:
        """
        Completely clears all temporal state and history.
        Must be called when a call/session ends or switches speakers.
        """
        self._history.clear()
        self._current_state = ReplayStatus.NOT_REPLAY
        self._consecutive_replay_count = 0
        self._consecutive_clean_count = 0
        self._consecutive_uncertain_count = 0
        self._total_processed = 0
        self._confirmed_replay_active = False
        self._last_result = None

    def _is_alternating_unstable(self) -> bool:
        """
        Detects alternating or oscillating observations in recent history
        (e.g., REPLAY followed by NOT_REPLAY repeatedly).
        """
        if len(self._history) < 4:
            return False

        recent = list(self._history)[-4:]
        flips = 0
        for i in range(1, len(recent)):
            s_prev = recent[i - 1].status
            s_curr = recent[i].status
            # Check if alternating between replay-like and clean-like
            prev_rep = s_prev in (ReplayStatus.REPLAY, ReplayStatus.LIKELY_REPLAY)
            curr_rep = s_curr in (ReplayStatus.REPLAY, ReplayStatus.LIKELY_REPLAY)
            if prev_rep != curr_rep:
                flips += 1

        return flips >= 3

    def process_observation(
        self,
        result: ReplayAnalysisResult,
        is_speech: bool = True,
        quality: Optional[AudioQualityResult] = None
    ) -> ReplayAnalysisResult:
        """
        Consumes a single-chunk ReplayAnalysisResult, updates temporal history,
        and applies hysteresis gating to yield a temporally smoothed ReplayAnalysisResult.
        """
        start_time = time.perf_counter()
        self._total_processed += 1

        # Determine observation validity
        is_valid = (
            result.status != ReplayStatus.MODEL_UNAVAILABLE and
            result.confidence is not None and
            (quality is None or quality.rating != AudioQualityRating.POOR)
        )

        obs = ReplayObservation(
            raw_probability=result.replay_probability,
            status=result.status,
            confidence=result.confidence,
            high_frequency_loss=result.high_frequency_loss,
            reverberation_decay_anomaly=result.reverberation_decay_anomaly,
            modulation_anomaly=getattr(result, "modulation_anomaly", False),
            cepstral_anomaly=getattr(result, "cepstral_anomaly", False),
            is_speech=is_speech,
            is_valid=is_valid
        )
        self._history.append(obs)

        explainability: List[str] = [
            "[DSP_HEURISTIC_TEMPORAL] Multi-turn temporal smoothing & hysteresis applied."
        ]

        # ---------------------------------------------------------------------
        # Case 1: Detector Failure / Model Unavailable
        # ---------------------------------------------------------------------
        if result.status == ReplayStatus.MODEL_UNAVAILABLE:
            self._consecutive_uncertain_count += 1
            if self._total_processed == 1 or self._consecutive_uncertain_count >= self.MAX_CONSECUTIVE_UNCERTAIN_FOR_DECAY:
                self._current_state = ReplayStatus.MODEL_UNAVAILABLE
            explainability.append(
                "[DSP_HEURISTIC_TEMPORAL] Underlying replay detector reported MODEL_UNAVAILABLE; temporal state preserved."
            )
            smoothed_res = ReplayAnalysisResult(
                status=self._current_state,
                replay_probability=result.replay_probability,
                confidence=0.0,
                high_frequency_loss=False,
                reverberation_decay_anomaly=False,
                model_version=result.model_version,
                engine_type="DSP_HEURISTIC_TEMPORAL",
                explainability=explainability + result.explainability,
                inference_latency_ms=round((time.perf_counter() - start_time) * 1000.0, 3)
            )
            self._last_result = smoothed_res
            return smoothed_res

        # ---------------------------------------------------------------------
        # Case 2: Insufficient audio, Poor quality, or UNCERTAIN observation
        # ---------------------------------------------------------------------
        if result.status == ReplayStatus.UNCERTAIN or not is_valid:
            self._consecutive_uncertain_count += 1
            self._consecutive_replay_count = 0  # Do not carry forward active replay counter through uncertainty
            self._consecutive_clean_count = 0

            if self._total_processed == 1:
                self._current_state = ReplayStatus.UNCERTAIN
                explainability.append(
                    "[DSP_HEURISTIC_TEMPORAL] Initial chunk is UNCERTAIN or degraded; no prior acoustic context."
                )
            elif self._consecutive_uncertain_count >= self.MAX_CONSECUTIVE_UNCERTAIN_FOR_DECAY:
                self._current_state = ReplayStatus.UNCERTAIN
                explainability.append(
                    f"[DSP_HEURISTIC_TEMPORAL] Sustained degraded/uncertain audio (>= {self.MAX_CONSECUTIVE_UNCERTAIN_FOR_DECAY} chunks); "
                    "transitioned state to UNCERTAIN to prevent stale state propagation."
                )
            else:
                # Retain previous hypothesis temporarily with decayed confidence
                explainability.append(
                    f"[DSP_HEURISTIC_TEMPORAL] Transient degraded/uncertain chunk ({self._consecutive_uncertain_count}/{self.MAX_CONSECUTIVE_UNCERTAIN_FOR_DECAY}); "
                    f"retaining prior status ({self._current_state.value}) with reduced confidence."
                )

        # ---------------------------------------------------------------------
        # Case 3: Replay-like observation (REPLAY or LIKELY_REPLAY)
        # ---------------------------------------------------------------------
        elif result.status in (ReplayStatus.REPLAY, ReplayStatus.LIKELY_REPLAY):
            self._consecutive_replay_count += 1
            self._consecutive_clean_count = 0
            self._consecutive_uncertain_count = 0

            if self._is_alternating_unstable():
                self._current_state = ReplayStatus.UNCERTAIN
                explainability.append(
                    "[DSP_HEURISTIC_TEMPORAL] Rapid alternating acoustic observations detected; "
                    "gating confirmed decision due to temporal instability."
                )
            elif self._consecutive_replay_count >= self.MIN_CONSECUTIVE_REPLAY_FOR_CONFIRMATION:
                # Check whether evidence includes confirmed REPLAY or strictly LIKELY_REPLAY
                has_strong_cue = any(
                    o.status == ReplayStatus.REPLAY
                    for o in list(self._history)[-self._consecutive_replay_count:]
                )
                self._current_state = ReplayStatus.REPLAY if has_strong_cue else ReplayStatus.LIKELY_REPLAY
                if self._current_state == ReplayStatus.REPLAY:
                    self._confirmed_replay_active = True
                explainability.append(
                    f"[DSP_HEURISTIC_TEMPORAL] Sustained replay evidence corroborated across {self._consecutive_replay_count} "
                    f"consecutive chunks; state transitioned to {self._current_state.value}."
                )
            else:
                # First replay observation: gated to LIKELY_REPLAY (suspicion, not confirmed)
                self._current_state = ReplayStatus.LIKELY_REPLAY
                explainability.append(
                    "[DSP_HEURISTIC_TEMPORAL] Initial replay evidence observed (frame 1); "
                    "gating confirmed REPLAY pending consecutive corroboration."
                )

        # ---------------------------------------------------------------------
        # Case 4: Clean observation (NOT_REPLAY)
        # ---------------------------------------------------------------------
        elif result.status == ReplayStatus.NOT_REPLAY:
            self._consecutive_clean_count += 1
            self._consecutive_replay_count = 0
            self._consecutive_uncertain_count = 0

            if self._is_alternating_unstable():
                self._current_state = ReplayStatus.UNCERTAIN
                explainability.append(
                    "[DSP_HEURISTIC_TEMPORAL] Rapid alternating acoustic observations detected; "
                    "gating decision due to temporal instability."
                )
            elif self._confirmed_replay_active:
                # Hysteresis: sustained replay requires multiple consecutive clean chunks to reset
                if self._consecutive_clean_count >= self.MIN_CONSECUTIVE_CLEAN_FOR_RESET:
                    self._confirmed_replay_active = False
                    self._current_state = ReplayStatus.NOT_REPLAY
                    explainability.append(
                        f"[DSP_HEURISTIC_TEMPORAL] Sustained clean observations ({self._consecutive_clean_count} chunks); "
                        "recovered from replay state to direct microphone voice."
                    )
                else:
                    # Demote to LIKELY_REPLAY during recovery cooldown, do not clear abruptly
                    self._current_state = ReplayStatus.LIKELY_REPLAY
                    explainability.append(
                        f"[DSP_HEURISTIC_TEMPORAL] Isolated clean observation ({self._consecutive_clean_count}/{self.MIN_CONSECUTIVE_CLEAN_FOR_RESET}) "
                        "following replay; maintaining suspicion via hysteresis."
                    )
            elif self._current_state == ReplayStatus.LIKELY_REPLAY:
                # If was unconfirmed transient suspicion, 1 clean chunk clears it back to NOT_REPLAY
                self._current_state = ReplayStatus.NOT_REPLAY
                explainability.append(
                    "[DSP_HEURISTIC_TEMPORAL] Transient replay suspicion attenuated by subsequent clean observation."
                )
            else:
                self._current_state = ReplayStatus.NOT_REPLAY
                explainability.append(
                    "[DSP_HEURISTIC_TEMPORAL] Stable direct microphone voice confirmed across consecutive observations."
                )

        # ---------------------------------------------------------------------
        # Score & Confidence Aggregation
        # ---------------------------------------------------------------------
        valid_scores = [
            o.raw_probability for o in self._history
            if o.raw_probability is not None and o.is_valid
        ]
        valid_confs = [
            o.confidence for o in self._history
            if o.confidence is not None and o.is_valid
        ]

        # Calculate smoothed probability from rolling median of valid scores
        if valid_scores:
            smoothed_score = float(np.median(valid_scores))
        else:
            smoothed_score = result.replay_probability

        # Calculate smoothed confidence
        if valid_confs:
            base_conf = float(np.mean(valid_confs))
            # Hysteresis confidence adjustments
            if self._current_state == ReplayStatus.REPLAY and self._consecutive_replay_count >= 2:
                base_conf = min(0.92, base_conf + 0.05)
            elif self._is_alternating_unstable():
                base_conf = max(0.20, base_conf * 0.45)
            elif self._consecutive_uncertain_count > 0:
                decay = 0.85 ** self._consecutive_uncertain_count
                base_conf = base_conf * decay
            smoothed_conf = base_conf
        else:
            smoothed_conf = result.confidence if result.confidence is not None else 0.0

        if result.confidence == 0.0 and self._current_state == ReplayStatus.UNCERTAIN and self._total_processed == 1:
            smoothed_conf = 0.0

        # Preserve physical indicator flags across the window
        hf_loss_any = any(o.high_frequency_loss for o in self._history if o.is_valid)
        reverb_anomaly_any = any(o.reverberation_decay_anomaly for o in self._history if o.is_valid)
        mod_anomaly_any = any(getattr(o, "modulation_anomaly", False) for o in self._history if o.is_valid)
        cep_anomaly_any = any(getattr(o, "cepstral_anomaly", False) for o in self._history if o.is_valid)

        smoothed_res = ReplayAnalysisResult(
            status=self._current_state,
            replay_probability=round(smoothed_score, 4) if smoothed_score is not None else None,
            confidence=round(smoothed_conf, 3) if smoothed_conf is not None else None,
            high_frequency_loss=hf_loss_any,
            reverberation_decay_anomaly=reverb_anomaly_any,
            modulation_anomaly=mod_anomaly_any,
            cepstral_anomaly=cep_anomaly_any,
            model_version=result.model_version,
            engine_type="DSP_HEURISTIC_TEMPORAL",
            explainability=explainability + result.explainability,
            inference_latency_ms=round((time.perf_counter() - start_time) * 1000.0, 3)
        )
        self._last_result = smoothed_res
        return smoothed_res

    def get_smoothed_result(self) -> Optional[ReplayAnalysisResult]:
        """Returns the most recent smoothed result, or None if no observations processed."""
        return self._last_result
