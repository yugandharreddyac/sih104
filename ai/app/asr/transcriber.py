"""
Streaming ASR Transcriber Orchestrator (Phase 4)
Ingests audio chunks, executes speech-to-text, and returns structured ASRResult.
"""

import time
import base64
import numpy as np
from typing import Optional

from ai.app.core.types import (
    ASRResult,
    PipelineStatus,
    AudioChunkPayload,
    AudioQualityResult
)
from ai.app.core.model_registry import ModelRegistry
from ai.app.asr.engine import StreamingASREngine


class StreamingASRTranscriber:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.model_version = "whisper_streaming_conformer_v4"
        self.engine = StreamingASREngine(sample_rate=sample_rate)

        model_meta = ModelRegistry.get_model(self.model_version)
        self.status = model_meta.status if model_meta else PipelineStatus.AVAILABLE

    def decode_samples(self, audio_base64: Optional[str]) -> np.ndarray:
        if not audio_base64:
            return np.zeros(0, dtype=np.float32)
        try:
            raw_bytes = base64.b64decode(audio_base64)
            if len(raw_bytes) < 2:
                return np.zeros(0, dtype=np.float32)
            int16_samples = np.frombuffer(raw_bytes, dtype=np.int16)
            return (int16_samples.astype(np.float32) / 32768.0).copy()
        except Exception:
            return np.zeros(0, dtype=np.float32)

    def transcribe(
        self,
        chunk: AudioChunkPayload,
        quality: Optional[AudioQualityResult] = None,
        language_hint: Optional[str] = None
    ) -> ASRResult:
        """
        Transcribes streaming audio chunk into partial/final transcript segment.
        """
        start_time = time.perf_counter()

        if self.status != PipelineStatus.AVAILABLE:
            return ASRResult(
                status=PipelineStatus.MODEL_UNAVAILABLE,
                model_version=self.model_version,
                transcript="",
                redacted_transcript="",
                confidence=0.0,
                uncertainty=1.0,
                inference_latency_ms=0.0
            )

        samples = self.decode_samples(chunk.audio_base64)
        text_hint = chunk.text_transcript or chunk.metadata.get("text_hint")
        effective_lang_hint = language_hint or chunk.metadata.get("language") or chunk.metadata.get("language_hint")
        start_ms = chunk.timestamp_ms or 0

        raw_text, segments, lang, conf, uncertainty = self.engine.transcribe_chunk(
            samples=samples,
            text_hint=text_hint,
            speaker_channel=chunk.speaker_channel,
            start_ms=start_ms,
            quality=quality,
            language_hint=effective_lang_hint
        )

        inference_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        return ASRResult(
            status=PipelineStatus.AVAILABLE,
            model_version=self.model_version,
            transcript=raw_text,
            redacted_transcript=raw_text,  # Redacted downstream by SensitiveDataDetector
            language=lang,
            language_confidence=0.95,
            segments=segments,
            word_count=len(raw_text.split()) if raw_text else 0,
            confidence=conf,
            uncertainty=uncertainty,
            is_final=True,
            inference_latency_ms=inference_latency_ms
        )
