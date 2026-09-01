"""
ASR Specific Types
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from ai.app.core.types import LanguageCode, TranscriptSegment, ASRResult


class ASRStreamingChunk(BaseModel):
    call_id: str
    stream_id: Optional[str] = None
    chunk_index: int
    audio_base64: Optional[str] = None
    text_hint: Optional[str] = None
    speaker_channel: int = 0
    timestamp_ms: Optional[int] = None
