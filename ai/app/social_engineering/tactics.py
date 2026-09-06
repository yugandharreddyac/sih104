"""
Social Engineering Linguistic Tactics Extractor (Master 2)
Detects complete taxonomy of psychological manipulation and coercion tactics:
Authority Impersonation, Urgency, Fear/Coercion, Secrecy, Isolation,
Reward Scams, Refusal Escalation, Account Suspension, and Digital Arrest Threats.
Supports English, Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, and Marathi.
"""

import re
from typing import Dict, List, Tuple
from ai.app.core.types import SocialEngineeringTactic

TACTIC_PATTERNS: Dict[SocialEngineeringTactic, List[re.Pattern]] = {
    SocialEngineeringTactic.AUTHORITY_EXPLOITATION: [
        re.compile(
            r'\b(i\s+am|this\s+is|we\s+are)\s+(calling\s+from\s+)?(the\s+|your\s+)?(bank\s+)?'
            r'(fraud\s+department|security\s+team|it\s+support|branch\s+manager|manager|police|cyber\s+crime|'
            r'headquarters|ceo|cfo|executive|helpdesk|officer|inspector)\b',
            re.I
        ),
        re.compile(
            r'\b(rbi|fbi|irs|police\s+station|tax\s+department|customs\s+office|bank\s+official|cbi|trai|dot\s+officer|'
            r'enforcement\s+directorate|income\s+tax\s+officer|cyber\s+cell)\b',
            re.I
        ),
        # Indic authority markers
        re.compile(
            r'\b(bank\s+se\s+bol\s+rahe\s+hai|police\s+station\s+se|bank\s+nundi|police\s+station\s+la\s+irunthu|'
            r'bankinda\s+maathadiddivi|police\s+stationinda|bankil\s+ninnu|bank\s+theke\s+bolchi)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.URGENCY_PRESSURE: [
        re.compile(
            r'\b(immediately|right\s+now|urgently|within\s+(?:2|5|10|15)\s+minutes|asap|instant|countdown|'
            r'turant|jaldi|ventane|ippove|seekkiram|ekhoni|lavkhar|thakshana|vegavagi|udanadi|ippol\s+thanne)\b',
            re.I
        ),
        re.compile(
            r'\b(time\s+is\s+running\s+out|limited\s+time|before\s+it\'s\s+too\s+late|instant\s+action|'
            r'act\s+fast|hurry\s+up|no\s+time\s+to\s+waste)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.FEAR_COERCION: [
        re.compile(
            r'\b(account\s+will\s+be\s+(?:blocked|suspended|frozen|closed|deactivated))\b',
            re.I
        ),
        re.compile(
            r'\b(arrest|legal\s+action|police\s+case|court\s+notice|penalty|heavy\s+fine|jail|fir\s+filed|'
            r'non-bailable\s+warrant|court\s+order)\b',
            re.I
        ),
        re.compile(
            r'\b(security\s+compromised|hacked|unauthorized\s+transaction|card\s+blocked|aadhaar\s+blocked)\b',
            re.I
        ),
        # Indic fear markers
        re.compile(
            r'\b(account\s+band\s+ho\s+jayega|block\s+avutundi|freeze\s+aagidum|bondho\s+hoye\s+jabe|band\s+hoil|'
            r'khatha\s+block\s+aagide|account\s+freeze\s+aayi|police\s+case\s+aaguththe)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.DIGITAL_ARREST_THREAT: [
        re.compile(
            r'\b(digital\s+arrest|virtual\s+arrest|under\s+digital\s+surveillance|stay\s+on\s+skype|'
            r'video\s+call\s+surveillance|narcotics\s+bureau|customs\s+seizure|drugs\s+in\s+parcel|'
            r'money\s+laundering\s+case|supreme\s+court\s+order|do\s+not\s+leave\s+the\s+room)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.ACCOUNT_SUSPENSION_THREAT: [
        re.compile(
            r'\b(sim\s+(?:card\s+)?.*?(?:block(?:ed)?|deactivat(?:ed|e|ion)?|disconnect(?:ed)?)|'
            r'electricity\s+(?:power\s+)?cut|'
            r'kyc\s+.*?(?:expired|pending|verification\s+failed|update)|pan\s+card\s+.*?(?:not\s+linked|invalid)|'
            r'service\s+will\s+be\s+terminated)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.SECRECY_DEMAND: [
        re.compile(
            r'\b(do\s+not|don\'t)\s+(tell|inform|share\s+with|mention\s+to)\s+(anyone|your\s+manager|family|colleagues|branch)\b',
            re.I
        ),
        re.compile(
            r'\b(keep\s+this\s+(?:strictly\s+)?confidential|secret\s+investigation|classified\s+matter|'
            r'kisi\s+ko\s+mat\s+batana|evariki\s+cheppoddu|yarukkum\s+sollaadhe|yarigoo\s+helabeda|aarodum\s+parayaruthu)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.ISOLATION_ATTEMPT: [
        re.compile(
            r'\b(stay\s+on\s+the\s+line|do\s+not\s+(?:hang\s+up|disconnect|call\s+back))\b',
            re.I
        ),
        re.compile(
            r'\b(phone\s+katna\s+mat|call\s+disconnect\s+mat\s+karna|cut\s+cheyoddu|phone\s+vaiyyaadhe|'
            r'call\s+cut\s+maadbedi|call\s+disconnect\s+cheyyaruthu)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.VERIFICATION_BYPASS: [
        re.compile(
            r'\b(no\s+need\s+to\s+call|don\'t\s+use\s+the\s+official\s+number|i\s+will\s+verify\s+you\s+here|i\s+will\s+verify\s+you\s+right\s+here)\b',
            re.I
        ),
        re.compile(
            r'\b(do\s+not|don\'t)\s+(call|contact)\s+(the\s+)?(branch|bank|official|official\s+number)\b',
            re.I
        ),
        re.compile(
            r'\b(bypass|skip\s+the|manual\s+override\s+code|direct\s+verification|ignore\s+the\s+warning)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.FINANCIAL_PRESSURE: [
        re.compile(
            r'\b(transfer|wire|send)\s+(money|funds|balance|payment)\s+(to\s+secure\s+account|immediately|via\s+upi)\b',
            re.I
        ),
        re.compile(
            r'\b(paisa\s+bhejo|advance\s+payment|security\s+deposit|gift\s+card|qr\s+code\s+scan)\b',
            re.I
        ),
        re.compile(
            r'\b(dabbulu\s+pampandi|panam\s+anupunga|taka\s+pathan|paise\s+pathva|duddu\s+kodi|panam\s+ayakkuka)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.REWARD_SCAM: [
        re.compile(
            r'\b(won\s+a\s+lottery|cashback\s+credited|lottery\s+prize|reward\s+points\s+redeem|'
            r'bonus\s+approved|you\s+have\s+been\s+selected|won\s+(?:25|50)\s+lakh|claim\s+your\s+reward)\b',
            re.I
        ),
    ],
    SocialEngineeringTactic.REFUSAL_ESCALATION: [
        re.compile(
            r'\b(if\s+you\s+do\s+not\s+(?:cooperate|listen|obey)|police\s+will\s+reach\s+your\s+house|'
            r'officers\s+are\s+on\s+the\s+way|you\s+will\s+face\s+consequences|i\s+am\s+dispatching\s+a\s+team|'
            r'cooperate\s+or\s+face\s+immediate\s+arrest)\b',
            re.I
        ),
    ],
}


class SocialEngineeringTacticsExtractor:
    def extract_tactics(self, text: str) -> Tuple[List[SocialEngineeringTactic], List[str]]:
        """
        Extracts social engineering tactics and matching evidence strings.
        """
        if not text:
            return [], []

        tactics_found: List[SocialEngineeringTactic] = []
        evidence_found: List[str] = []

        for tactic, patterns in TACTIC_PATTERNS.items():
            for p in patterns:
                m = p.search(text)
                if m:
                    tactics_found.append(tactic)
                    evidence_found.append(f"[{tactic.value}] '{m.group(0)}'")
                    break

        return tactics_found, evidence_found
