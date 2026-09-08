import React from 'react';

/**
 * Common regex patterns for sensitive credentials in telephony/transcripts
 */
const SENSITIVE_PATTERNS = [
  /\b\d{6}\b/g, // 6-digit OTPs
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, // 16-digit Card Numbers
  /\b\d{3,4}\b(?=\s*(?:cvv|cvc|security code|pin))/gi, // CVVs with context
  /(?:password|passcode|pin|secret|otp|one[- ]time password)\s*(?:is|:)?\s*([A-Za-z0-9@#$%^&*!]+)/gi,
];

/**
 * Sanitizes any raw string by replacing sensitive data with [REDACTED]
 */
export function sanitizeTranscript(text: string): string {
  if (!text) return '';
  let sanitized = text;

  // Protect already redacted text
  if (sanitized.includes('[REDACTED]')) {
    return sanitized;
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // If match contains context keyword, preserve keyword and redact value
      if (/password|passcode|pin|secret|otp/i.test(match)) {
        return match.replace(/([A-Za-z0-9@#$%^&*!]{3,})/g, '[REDACTED]');
      }
      return '[REDACTED]';
    });
  }

  return sanitized;
}

/**
 * Renders text containing [REDACTED] with visual highlight badges
 */
export function renderRedactedText(text: string): React.ReactNode {
  if (!text) return null;

  if (!text.includes('[REDACTED]')) {
    return text;
  }

  const parts = text.split(/(\[REDACTED\])/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part === '[REDACTED]') {
          return (
            <span
              key={index}
              className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-[#C87524]/15 text-[#C87524] border border-[#C87524]/35 text-[11px] font-mono font-bold select-none tracking-wider shadow-sm"
              title="Sensitive Credential Redacted by VOXSHIELD Privacy Firewall"
            >
              [REDACTED]
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
