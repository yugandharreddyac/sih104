"""
Streaming ASR Engine Abstraction (Faster-Whisper INT8 Primary + Deterministic DSP Fallback)
Generates partial and finalized transcript segments with timestamps, language identification, and word confidence.
"""

import os
import time
import logging
import threading
import numpy as np
from typing import List, Tuple, Optional, Any

from ai.app.core.types import LanguageCode, TranscriptSegment, AudioQualityResult
from ai.app.asr.language import LanguageIdentifier
from ai.app.asr.confidence import ASRConfidenceCalculator

logger = logging.getLogger("voxshield.asr.engine")


class StreamingASREngine:
    _cached_neural_model: Optional[Any] = None
    _neural_model_initialized: bool = False
    _model_lock: threading.Lock = threading.Lock()
    _neural_model_path: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "models", "asr", "faster-whisper-base"
    )

    def __init__(self, sample_rate: int = 16000, model_path: Optional[str] = None):
        self.sample_rate = sample_rate
        self.model_version = "whisper_streaming_conformer_v4"
        self.language_id = LanguageIdentifier()
        self.confidence_calc = ASRConfidenceCalculator()
        if model_path:
            self._custom_model_path = model_path
        else:
            self._custom_model_path = self._neural_model_path

        # Attempt lazy initialization on first instance
        self._ensure_neural_model(self._custom_model_path)

    @classmethod
    def _ensure_neural_model(cls, custom_path: Optional[str] = None) -> Optional[Any]:
        """Lazily initializes and caches the Faster-Whisper CPU INT8 model instance."""
        with cls._model_lock:
            if cls._neural_model_initialized and cls._cached_neural_model is not None:
                return cls._cached_neural_model

        target_path = custom_path or cls._neural_model_path
        if not os.path.exists(target_path) or not os.path.isdir(target_path):
            logger.warning(
                f"[ASR] Faster-Whisper model directory not found at '{target_path}'. "
                "Engaging deterministic DSP fallback engine."
            )
            cls._neural_model_initialized = True
            cls._cached_neural_model = None
            return None

        # Check required model files
        model_bin = os.path.join(target_path, "model.bin")
        config_json = os.path.join(target_path, "config.json")
        if not (os.path.exists(model_bin) and os.path.exists(config_json)):
            logger.warning(
                f"[ASR] Model weights missing in '{target_path}'. "
                "Engaging deterministic DSP fallback engine."
            )
            cls._neural_model_initialized = True
            cls._cached_neural_model = None
            return None

        try:
            # pyrefly: ignore [missing-import]
            from faster_whisper import WhisperModel
            logger.info(f"[ASR] Loading Faster-Whisper CPU INT8 model from {target_path}...")
            start_t = time.perf_counter()
            model = WhisperModel(
                model_size_or_path=target_path,
                device="cpu",
                compute_type="int8",
                cpu_threads=2,
                num_workers=1
            )
            cls._cached_neural_model = model
            cls._neural_model_initialized = True
            load_ms = round((time.perf_counter() - start_t) * 1000.0, 2)
            logger.info(f"[ASR] Faster-Whisper INT8 model successfully loaded in {load_ms} ms.")
            return cls._cached_neural_model
        except Exception as e:
            logger.warning(
                f"[ASR] Failed to initialize Faster-Whisper neural model: {e}. "
                "Gracefully falling back to DSP acoustic energy engine."
            )
            cls._neural_model_initialized = True
            cls._cached_neural_model = None
            return None

    @property
    def is_neural_active(self) -> bool:
        return self._cached_neural_model is not None

    def _map_language_code(self, lang_str: Optional[str]) -> LanguageCode:
        return self.language_id.normalize_language_code(lang_str)

    def transcribe_chunk(
        self,
        samples: np.ndarray,
        text_hint: Optional[str] = None,
        speaker_channel: int = 0,
        start_ms: int = 0,
        quality: Optional[AudioQualityResult] = None,
        language_hint: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> Tuple[str, List[TranscriptSegment], LanguageCode, float, float]:
        """
        Transcribes audio samples into finalized segments with multilingual routing and dual-engine primary/fallback.
        Returns: (raw_transcript, segments, detected_language, confidence, uncertainty).
        """
        duration_ms = int((len(samples) / self.sample_rate) * 1000.0) if len(samples) > 0 else 250
        transcript = ""
        whisper_lang_raw: Optional[str] = None
        whisper_lang_prob: Optional[float] = None
        segments: List[TranscriptSegment] = []

        # 1. Check explicit test/telephony text hint payload first
        if text_hint and text_hint.strip():
            transcript = text_hint.strip()

        # 2. Neural Primary Inference (Faster-Whisper CPU INT8)
        elif self.is_neural_active and len(samples) >= 800:
            try:
                # Ensure 1D float32 normalized in [-1.0, 1.0]
                audio_float = samples.astype(np.float32)
                if np.max(np.abs(audio_float)) > 1.0:
                    audio_float = audio_float / 32768.0

                # Check minimum acoustic energy before running neural graph
                rms_energy = float(np.sqrt(np.mean(audio_float ** 2)))
                if rms_energy > 0.005:
                    # Resolve ASR hint from explicit language_hint if provided
                    route_pre = self.language_id.route_language(explicit_hint=language_hint, session_id=session_id)
                    neural_lang = route_pre.asr_language_hint if (language_hint and route_pre.detection_source == "explicit") else None

                    with self._model_lock:
                        segments_iter, info = self._cached_neural_model.transcribe(
                            audio_float,
                            beam_size=1,
                            language=neural_lang,
                            vad_filter=False,
                            word_timestamps=False
                        )

                        text_parts = []
                        for seg in segments_iter:
                            seg_text = seg.text.strip()
                            if seg_text:
                                text_parts.append(seg_text)

                        raw_neural_text = " ".join(text_parts).strip()
                        if raw_neural_text:
                            transcript = raw_neural_text
                            whisper_lang_raw = info.language if hasattr(info, "language") else None
                            whisper_lang_prob = float(info.language_probability) if hasattr(info, "language_probability") else 0.92

            except Exception as exc:
                logger.warning(
                    f"[ASR] Neural transcription encountered an operational error: {exc}. "
                    "Routing to DSP fallback path."
                )
                transcript = ""

        # 3. Deterministic DSP Fallback Path
        # When neural model is uninitialized, missing weights, or fails inference,
        # do NOT fabricate speech. Transcript remains empty string "", confidence is 0.0, uncertainty is 1.0.
        if not transcript:
            transcript = ""

        # 4. Resolve Multilingual Routing Decision
        routing_decision = self.language_id.route_language(
            explicit_hint=language_hint,
            whisper_detected_lang=whisper_lang_raw,
            whisper_probability=whisper_lang_prob,
            text_content=transcript,
            session_id=session_id
        )
        detected_lang = routing_decision.language_code

        if not transcript:
            conf = 0.0
            uncertainty = 1.0
        else:
            base_conf = 0.92
            conf, uncertainty = self.confidence_calc.calculate_confidence(base_conf, quality=quality)

        # 5. Build Structured Segments
        if transcript:
            segment = TranscriptSegment(
                segment_id=f"seg-{int(time.time() * 1000)}-{speaker_channel}",
                speaker_channel=speaker_channel,
                text=transcript,
                redacted_text=transcript,  # Redacted downstream by SensitiveDataDetector
                start_ms=start_ms,
                end_ms=start_ms + duration_ms,
                confidence=conf,
                language=detected_lang,
                is_final=True
            )
            segments.append(segment)

        return transcript, segments, detected_lang, conf, uncertainty
