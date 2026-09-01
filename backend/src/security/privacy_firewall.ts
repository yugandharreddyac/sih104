/**
 * VOXSHIELD Privacy Firewall & Redaction Engine
 * Pre-persistence deterministic sanitizer for audio transcripts, logs, and metadata.
 * Ensures zero leakage of authentication secrets, OTPs, CVVs, PINs, or credentials.
 */

export enum RedactionCategory {
  OTP = 'OTP',
  MFA = 'MFA',
  PASSWORD = 'PASSWORD',
  PIN = 'PIN',
  CVV = 'CVV',
  CARD_NUMBER = 'CARD_NUMBER',
  ACCOUNT_CREDENTIAL = 'ACCOUNT_CREDENTIAL',
  API_KEY = 'API_KEY',
  ACCESS_TOKEN = 'ACCESS_TOKEN',
  PERSONAL_INFORMATION = 'PERSONAL_INFORMATION',
  CONFIDENTIAL_INFORMATION = 'CONFIDENTIAL_INFORMATION',
}

export interface RedactionFinding {
  category: RedactionCategory;
  originalMasked: string;
  startIndex: number;
  endIndex: number;
}

export interface SanitizationResult {
  sanitizedText: string;
  redactionsCount: number;
  findings: RedactionFinding[];
  hasSensitiveSecrets: boolean;
}

export class PrivacyFirewall {
  // Regex rules for deterministic pre-persistence entity redaction
  private static readonly RULES: Array<{
    category: RedactionCategory;
    pattern: RegExp;
    replacement: string;
  }> = [
    // 1. One-Time Passwords (OTP) e.g. "otp is 482913", "one-time passcode 938472"
    {
      category: RedactionCategory.OTP,
      pattern: /\b(?:otp|one[- ]time (?:password|passcode|code)|verification code)\s*(?:is|:|=)?\s*([0-9]{4,8})\b/gi,
      replacement: '[AUTHENTICATION_CODE_REDACTED]',
    },
    // 2. MFA Tokens e.g. "mfa code 582910", "authenticator code 847291"
    {
      category: RedactionCategory.MFA,
      pattern: /\b(?:mfa|2fa|authenticator code|security token)\s*(?:is|:|=)?\s*([0-9a-z]{6,8})\b/gi,
      replacement: '[MFA_TOKEN_REDACTED]',
    },
    // 3. CVV / CVC (3 or 4 digits) with conversational filler support
    {
      category: RedactionCategory.CVV,
      pattern: /\b(?:cvv|cvc|security code|card verification value)(?:[^\d]{0,30})?\b([0-9]{3,4})\b/gi,
      replacement: '[CVV_REDACTED]',
    },
    // 4. Payment Card PAN (13 to 19 digits)
    {
      category: RedactionCategory.CARD_NUMBER,
      pattern: /\b(?:\d[ -]*?){13,19}\b/g,
      replacement: '[CARD_NUMBER_REDACTED]',
    },
    // 5. PIN Codes (4-6 digits)
    {
      category: RedactionCategory.PIN,
      pattern: /\b(?:pin|atm pin|secret pin)\s*(?:is|:|=)?\s*([0-9]{4,6})\b/gi,
      replacement: '[PIN_REDACTED]',
    },
    // 6. Passwords e.g. "password is Password123!"
    {
      category: RedactionCategory.PASSWORD,
      pattern: /\b(?:password|passcode)\s*(?:is|:|=)\s*([^\s,.]+)/gi,
      replacement: '[PASSWORD_REDACTED]',
    },
    // 7. API Keys & Bearer Tokens
    {
      category: RedactionCategory.API_KEY,
      pattern: /\b(?:api[_-]?key|secret[_-]?key|token)\s*(?:is|:|=)?\s*([A-Za-z0-9_\-]{20,})\b/gi,
      replacement: '[API_KEY_REDACTED]',
    },
    // 8. Bearer / Access Tokens
    {
      category: RedactionCategory.ACCESS_TOKEN,
      pattern: /\b(?:Bearer\s+[A-Za-z0-9_\-\.]{20,})\b/gi,
      replacement: '[ACCESS_TOKEN_REDACTED]',
    },
    // 9. SSN / National Identification (US SSN: 3-2-4 digits)
    {
      category: RedactionCategory.PERSONAL_INFORMATION,
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement: '[PII_IDENTIFIER_REDACTED]',
    },
  ];

  /**
   * Sanitizes an inbound transcript or text payload before persistence.
   */
  public static sanitize(rawText: string): SanitizationResult {
    if (!rawText || typeof rawText !== 'string') {
      return {
        sanitizedText: '',
        redactionsCount: 0,
        findings: [],
        hasSensitiveSecrets: false,
      };
    }

    let sanitized = rawText;
    const findings: RedactionFinding[] = [];

    for (const rule of this.RULES) {
      sanitized = sanitized.replace(rule.pattern, (match, p1, offset) => {
        findings.push({
          category: rule.category,
          originalMasked: `***${match.length}chars***`,
          startIndex: offset || 0,
          endIndex: (offset || 0) + match.length,
        });
        return rule.replacement;
      });
    }

    return {
      sanitizedText: sanitized,
      redactionsCount: findings.length,
      findings,
      hasSensitiveSecrets: findings.length > 0,
    };
  }

  /**
   * Sanitizes structured JSON metadata objects recursively.
   */
  public static sanitizeObject<T extends Record<string, any>>(obj: T): T {
    const sensitiveKeys = ['otp', 'password', 'pin', 'cvv', 'card_number', 'secret', 'token', 'apiKey', 'mfa'];
    const sanitizedObj: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      const isSensitiveKey = sensitiveKeys.some((k) => key.toLowerCase().includes(k));
      if (isSensitiveKey && typeof value === 'string') {
        sanitizedObj[key] = '[AUTHENTICATION_CODE_REDACTED]';
      } else if (typeof value === 'string') {
        sanitizedObj[key] = this.sanitize(value).sanitizedText;
      } else if (typeof value === 'object' && value !== null) {
        sanitizedObj[key] = this.sanitizeObject(value);
      } else {
        sanitizedObj[key] = value;
      }
    }

    return sanitizedObj as T;
  }
}
