"""
Multilingual Language Router & Indian Dialect Support (Phase 6.5)
Supports:
1. Hindi (hi)
2. Tamil (ta)
3. Telugu (te)
4. Bengali (bn)
5. Marathi (mr)
6. Indian English (en-IN) / English (en)

Features:
- Layered detection strategy (Explicit hint -> Faster-Whisper native -> Script/Lexical heuristic -> Multi-turn Context)
- Normalization for standard and Indian locale string variants
- Multi-turn conversational language tracking with smooth switching (sliding window)
- Lightweight code-switching / mixed language estimation
- Zero-crash fallback and safe unsupported language handling
"""

import re
import time
from typing import Dict, List, Optional, Tuple, Any
from pydantic import BaseModel, Field

from ai.app.core.types import LanguageCode


class LanguageRoutingDecision(BaseModel):
    language_code: LanguageCode
    display_name: str
    asr_language_hint: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    detection_source: str
    primary_language: LanguageCode
    secondary_language: Optional[LanguageCode] = None
    mixed_language_detected: bool = False
    is_fallback: bool = False


class LanguageContextObservation(BaseModel):
    language_code: LanguageCode
    confidence: float
    timestamp: float = Field(default_factory=time.time)


class LanguageContextTracker:
    """
    Maintains a memory-bounded sliding window of recent language observations per call session.
    Supports dynamic language switching without permanently locking to the first turn.
    """
    def __init__(self, max_history: int = 5, max_sessions: int = 1000):
        self.max_history = max_history
        self.max_sessions = max_sessions
        self._sessions: Dict[str, List[LanguageContextObservation]] = {}
        self._session_timestamps: Dict[str, float] = {}

    def record_observation(self, session_id: str, lang: LanguageCode, confidence: float) -> None:
        if not session_id:
            return

        now = time.time()
        # Enforce memory bounds on session dictionary
        if len(self._sessions) >= self.max_sessions and session_id not in self._sessions:
            oldest_id = min(self._session_timestamps, key=self._session_timestamps.get)
            self._sessions.pop(oldest_id, None)
            self._session_timestamps.pop(oldest_id, None)

        if session_id not in self._sessions:
            self._sessions[session_id] = []

        history = self._sessions[session_id]
        history.append(LanguageContextObservation(language_code=lang, confidence=confidence, timestamp=now))
        if len(history) > self.max_history:
            history.pop(0)

        self._session_timestamps[session_id] = now

    def get_dominant_language(self, session_id: str) -> Optional[Tuple[LanguageCode, float]]:
        if not session_id or session_id not in self._sessions:
            return None

        history = self._sessions[session_id]
        if not history:
            return None

        # Weighted voting by confidence and recency
        votes: Dict[LanguageCode, float] = {}
        total_weight = 0.0

        for idx, obs in enumerate(history):
            recency_weight = 1.0 + (idx / len(history)) * 0.5
            w = obs.confidence * recency_weight
            votes[obs.language_code] = votes.get(obs.language_code, 0.0) + w
            total_weight += w

        if total_weight <= 0:
            return None

        dominant_lang = max(votes, key=votes.get)
        dominant_conf = votes[dominant_lang] / total_weight
        return dominant_lang, round(min(0.98, dominant_conf), 3)

    def clear_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
        self._session_timestamps.pop(session_id, None)


class LanguageIdentifier:
    # Character Unicode ranges for Indian script detection
    HINDI_DEVANAGARI_RANGE = re.compile(r'[\u0900-\u097F]')
    BENGALI_RANGE = re.compile(r'[\u0980-\u09FF]')
    TELUGU_RANGE = re.compile(r'[\u0C00-\u0C7F]')
    TAMIL_RANGE = re.compile(r'[\u0B80-\u0BFF]')

    # Transliterated / romanized markers and vocabulary (distinct phoneme roots)
    HINDI_MARKERS = {"aapka", "kripya", "bhejiye", "khata", "surakshit", "turant", "paisa", "bataye", "karo", "namaste", "dhanyawad", "hai", "nahi"}
    TELUGU_MARKERS = {"meeru", "cheppandi", "dabbulu", "khatha", "ventane", "pampandi", "raaledu", "namaskaram", "dhanyavadalu", "andi", "undi", "kadu"}
    TAMIL_MARKERS = {"unggal", "solla", "panam", "kanakku", "udanadiyaga", "anuppavum", "vanakkam", "nandri", "illai", "irukku", "kodu"}
    BENGALI_MARKERS = {"apnar", "bolun", "taka", "ekhoni", "pathan", "nomoshkar", "dhonnobad", "ache", "nei", "koren"}
    MARATHI_MARKERS = {"tumcha", "sanga", "paise", "khate", "twarit", "pathva", "namaskar", "dhanyavad", "ahe", "nahi", "kara"}
    ENGLISH_TECH_MARKERS = {"otp", "bank", "account", "manager", "transfer", "urgent", "security", "password", "card", "cvv", "verify", "calling", "funds", "transaction"}

    # Supported Language Metadata Map
    LANGUAGE_METADATA: Dict[LanguageCode, Dict[str, str]] = {
        LanguageCode.HI: {"display_name": "Hindi", "asr_hint": "hi"},
        LanguageCode.TA: {"display_name": "Tamil", "asr_hint": "ta"},
        LanguageCode.TE: {"display_name": "Telugu", "asr_hint": "te"},
        LanguageCode.BN: {"display_name": "Bengali", "asr_hint": "bn"},
        LanguageCode.MR: {"display_name": "Marathi", "asr_hint": "mr"},
        LanguageCode.EN_IN: {"display_name": "Indian English", "asr_hint": "en"},
        LanguageCode.EN: {"display_name": "English", "asr_hint": "en"},
        LanguageCode.UNKNOWN: {"display_name": "Unknown", "asr_hint": None},
        LanguageCode.UNSUPPORTED: {"display_name": "Unsupported", "asr_hint": None},
    }

    def __init__(self):
        self.context_tracker = LanguageContextTracker()

    @staticmethod
    def normalize_language_code(lang_str: Optional[str]) -> LanguageCode:
        """
        Normalizes arbitrary string locale representations to standard LanguageCode enum.
        """
        if not lang_str:
            return LanguageCode.UNKNOWN

        clean = lang_str.strip().lower().replace("_", "-")

        # 1. Hindi
        if clean in ("hi", "hi-in", "hin", "hindi", "hin-in"):
            return LanguageCode.HI
        # 2. Tamil
        elif clean in ("ta", "ta-in", "tam", "tamil", "tam-in"):
            return LanguageCode.TA
        # 3. Telugu
        elif clean in ("te", "te-in", "tel", "telugu", "tel-in"):
            return LanguageCode.TE
        # 4. Bengali
        elif clean in ("bn", "bn-in", "ben", "bengali", "bangla", "ben-in"):
            return LanguageCode.BN
        # 5. Marathi
        elif clean in ("mr", "mr-in", "mar", "marathi", "mar-in"):
            return LanguageCode.MR
        # 6. Indian English
        elif clean in ("en-in", "english-india", "english india", "indian english", "indian-english"):
            return LanguageCode.EN_IN
        # 7. Generic English
        elif clean in ("en", "eng", "english", "en-us", "en-gb"):
            return LanguageCode.EN
        # 8. Unsupported / Unknown
        return LanguageCode.UNSUPPORTED

    def detect_from_text(self, text: str) -> Tuple[LanguageCode, float, bool, Optional[LanguageCode]]:
        """
        Extracts script and lexical evidence from transcript text.
        Returns: (primary_lang, confidence, mixed_language_detected, secondary_lang)
        """
        if not text or len(text.strip()) == 0:
            return LanguageCode.EN, 0.50, False, None

        # 1. Native Unicode Script Detection
        if self.TAMIL_RANGE.search(text):
            return LanguageCode.TA, 0.95, False, None
        if self.TELUGU_RANGE.search(text):
            return LanguageCode.TE, 0.95, False, None
        if self.BENGALI_RANGE.search(text):
            return LanguageCode.BN, 0.95, False, None
        if self.HINDI_DEVANAGARI_RANGE.search(text):
            if any(m in text for m in ("आहे", "नाही", "करा", "सांगा")):
                return LanguageCode.MR, 0.92, False, None
            return LanguageCode.HI, 0.95, False, None

        # 2. Transliterated Lexical Token Matching
        words = set(re.findall(r'[a-zA-Z]+', text.lower()))
        if not words:
            return LanguageCode.EN, 0.50, False, None

        hi_count = len(words.intersection(self.HINDI_MARKERS))
        te_count = len(words.intersection(self.TELUGU_MARKERS))
        ta_count = len(words.intersection(self.TAMIL_MARKERS))
        bn_count = len(words.intersection(self.BENGALI_MARKERS))
        mr_count = len(words.intersection(self.MARATHI_MARKERS))
        en_count = len(words.intersection(self.ENGLISH_TECH_MARKERS))

        counts = {
            LanguageCode.HI: hi_count,
            LanguageCode.TE: te_count,
            LanguageCode.TA: ta_count,
            LanguageCode.BN: bn_count,
            LanguageCode.MR: mr_count,
        }
        max_lang = max(counts, key=counts.get)
        max_hits = counts[max_lang]

        if max_hits > 0:
            confidence = min(0.92, 0.60 + max_hits * 0.12)
            is_mixed = en_count > 0
            secondary = LanguageCode.EN_IN if is_mixed else None
            return max_lang, confidence, is_mixed, secondary

        # Default to standard English when words are in Latin characters
        is_mixed = False
        return LanguageCode.EN, 0.90, is_mixed, None

    def route_language(
        self,
        explicit_hint: Optional[str] = None,
        whisper_detected_lang: Optional[str] = None,
        whisper_probability: Optional[float] = None,
        text_content: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> LanguageRoutingDecision:
        """
        Executes layered multilingual routing decision:
        Layer 1: Explicit hint (validated & normalized)
        Layer 2: Text script / lexical analysis
        Layer 3: Whisper native neural detection
        Layer 4: Multi-turn session context smoothing
        Layer 5: Safe fallback
        """
        # --- Layer 1: Explicit Application Hint ---
        if explicit_hint:
            norm_code = self.normalize_language_code(explicit_hint)
            if norm_code != LanguageCode.UNSUPPORTED and norm_code != LanguageCode.UNKNOWN:
                meta = self.LANGUAGE_METADATA.get(norm_code, self.LANGUAGE_METADATA[LanguageCode.EN])
                if session_id:
                    self.context_tracker.record_observation(session_id, norm_code, 0.98)
                return LanguageRoutingDecision(
                    language_code=norm_code,
                    display_name=meta["display_name"],
                    asr_language_hint=meta["asr_hint"],
                    confidence=0.98,
                    detection_source="explicit",
                    primary_language=norm_code,
                    secondary_language=None,
                    mixed_language_detected=False,
                    is_fallback=False
                )

        # --- Layer 2: Text Script / Lexical Analysis ---
        if text_content and len(text_content.strip()) > 0:
            text_lang, text_conf, is_mixed, sec_lang = self.detect_from_text(text_content)
            if text_conf >= 0.70:
                meta = self.LANGUAGE_METADATA.get(text_lang, self.LANGUAGE_METADATA[LanguageCode.EN])
                if session_id:
                    self.context_tracker.record_observation(session_id, text_lang, text_conf)
                return LanguageRoutingDecision(
                    language_code=text_lang,
                    display_name=meta["display_name"],
                    asr_language_hint=meta["asr_hint"],
                    confidence=text_conf,
                    detection_source="script_heuristic" if (self.HINDI_DEVANAGARI_RANGE.search(text_content) or self.TELUGU_RANGE.search(text_content) or self.TAMIL_RANGE.search(text_content) or self.BENGALI_RANGE.search(text_content)) else "lexical_heuristic",
                    primary_language=text_lang,
                    secondary_language=sec_lang,
                    mixed_language_detected=is_mixed,
                    is_fallback=False
                )

        # --- Layer 3: Whisper Neural Detection ---
        if whisper_detected_lang:
            norm_code = self.normalize_language_code(whisper_detected_lang)
            prob = float(whisper_probability) if whisper_probability is not None else 0.85

            if norm_code != LanguageCode.UNSUPPORTED and norm_code != LanguageCode.UNKNOWN:
                effective_code = LanguageCode.EN_IN if norm_code == LanguageCode.EN else norm_code
                meta = self.LANGUAGE_METADATA.get(effective_code, self.LANGUAGE_METADATA[LanguageCode.EN_IN])
                if session_id:
                    self.context_tracker.record_observation(session_id, effective_code, prob)
                return LanguageRoutingDecision(
                    language_code=effective_code,
                    display_name=meta["display_name"],
                    asr_language_hint=meta["asr_hint"],
                    confidence=round(prob, 3),
                    detection_source="neural_whisper",
                    primary_language=effective_code,
                    secondary_language=None,
                    mixed_language_detected=False,
                    is_fallback=False
                )

        # --- Layer 4: Multi-Turn Session Context Smoothing ---
        if session_id:
            ctx = self.context_tracker.get_dominant_language(session_id)
            if ctx:
                ctx_lang, ctx_conf = ctx
                meta = self.LANGUAGE_METADATA.get(ctx_lang, self.LANGUAGE_METADATA[LanguageCode.EN])
                return LanguageRoutingDecision(
                    language_code=ctx_lang,
                    display_name=meta["display_name"],
                    asr_language_hint=meta["asr_hint"],
                    confidence=ctx_conf,
                    detection_source="session_context",
                    primary_language=ctx_lang,
                    secondary_language=None,
                    mixed_language_detected=False,
                    is_fallback=False
                )

        # --- Layer 5: Safe Fallback ---
        meta = self.LANGUAGE_METADATA[LanguageCode.EN_IN]
        return LanguageRoutingDecision(
            language_code=LanguageCode.EN_IN,
            display_name=meta["display_name"],
            asr_language_hint=meta["asr_hint"],
            confidence=0.60,
            detection_source="fallback",
            primary_language=LanguageCode.EN_IN,
            secondary_language=None,
            mixed_language_detected=False,
            is_fallback=True
        )

    def detect_language(self, text: str) -> Tuple[LanguageCode, float]:
        """
        Legacy backward-compatible interface.
        Returns: (LanguageCode, confidence)
        """
        decision = self.route_language(text_content=text)
        return decision.language_code, decision.confidence
