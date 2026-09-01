"""
Contextual Conversational Intent Classifier
Evaluates multi-turn semantic markers, linguistic intent taxonomy, and ASR confidence dampening.
"""

from typing import List, Tuple
from ai.app.core.types import IntentCategory, IntentResult
from ai.app.intent.taxonomy import INTENT_PATTERNS


class ConversationalIntentClassifier:
    def __init__(self):
        self.model_version = "intent_classifier_multi_token_v4"

    def classify(self, text: str, asr_confidence: float = 1.0) -> IntentResult:
        """
        Evaluates conversational intent from text transcript with ASR uncertainty scaling.
        """
        if not text or len(text.strip()) == 0:
            return IntentResult(
                primary_intent=IntentCategory.BENIGN_INQUIRY,
                confidence=0.50 * asr_confidence,
                secondary_intents=[],
                is_adversarial=False,
                evidence_cues=[]
            )

        matched_intents: List[Tuple[IntentCategory, float, str]] = []

        for category, patterns in INTENT_PATTERNS.items():
            for p in patterns:
                m = p.search(text)
                if m:
                    cue = m.group(0)
                    matched_intents.append((category, 0.92, f"Matched '{cue}' for {category.value}"))
                    break

        if not matched_intents:
            return IntentResult(
                primary_intent=IntentCategory.BENIGN_INQUIRY,
                confidence=round(0.85 * asr_confidence, 3),
                secondary_intents=[],
                is_adversarial=False,
                evidence_cues=["Standard benign conversational dialogue."]
            )

        # Sort by confidence
        matched_intents.sort(key=lambda x: x[1], reverse=True)
        primary = matched_intents[0][0]
        base_conf = matched_intents[0][1]
        cues = [m[2] for m in matched_intents]

        calibrated_conf = round(base_conf * asr_confidence, 3)
        secondary = [m[0] for m in matched_intents[1:]]

        is_adversarial = primary in [
            IntentCategory.OTP_REQUEST,
            IntentCategory.PASSWORD_RESET,
            IntentCategory.MONEY_TRANSFER_REQUEST,
            IntentCategory.REMOTE_ACCESS_REQUEST,
            IntentCategory.AUTHENTICATION_BYPASS,
            IntentCategory.CARD_INFORMATION_REQUEST,
            IntentCategory.CALLBACK_AVOIDANCE
        ]

        return IntentResult(
            primary_intent=primary,
            confidence=calibrated_conf,
            secondary_intents=secondary,
            is_adversarial=is_adversarial,
            evidence_cues=cues
        )
