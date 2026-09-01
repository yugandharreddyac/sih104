import { PrivacyFirewall, RedactionCategory } from '../src/security/privacy_firewall';

describe('Privacy Firewall & Redaction Engine Unit Tests', () => {
  it('should redact numeric OTPs from text', () => {
    const raw = 'The customer stated: my OTP is 482913, please verify quickly.';
    const result = PrivacyFirewall.sanitize(raw);

    expect(result.hasSensitiveSecrets).toBe(true);
    expect(result.sanitizedText).toContain('[AUTHENTICATION_CODE_REDACTED]');
    expect(result.sanitizedText).not.toContain('482913');
  });

  it('should redact MFA and 2FA tokens', () => {
    const raw = 'Please enter your authenticator code 847291 on the screen.';
    const result = PrivacyFirewall.sanitize(raw);

    expect(result.hasSensitiveSecrets).toBe(true);
    expect(result.sanitizedText).toContain('[MFA_TOKEN_REDACTED]');
    expect(result.sanitizedText).not.toContain('847291');
  });

  it('should redact CVV security codes', () => {
    const raw = 'The security code on back of card is 492.';
    const result = PrivacyFirewall.sanitize(raw);

    expect(result.hasSensitiveSecrets).toBe(true);
    expect(result.sanitizedText).toContain('[CVV_REDACTED]');
    expect(result.sanitizedText).not.toContain('492');
  });

  it('should redact 16-digit credit card numbers', () => {
    const raw = 'My visa card number is 4532-1928-3847-1920.';
    const result = PrivacyFirewall.sanitize(raw);

    expect(result.hasSensitiveSecrets).toBe(true);
    expect(result.sanitizedText).toContain('[CARD_NUMBER_REDACTED]');
    expect(result.sanitizedText).not.toContain('4532');
  });

  it('should redact plain passwords and PINs', () => {
    const raw = 'The secret PIN is 8492 and password is SuperSecret123!';
    const result = PrivacyFirewall.sanitize(raw);

    expect(result.hasSensitiveSecrets).toBe(true);
    expect(result.sanitizedText).toContain('[PIN_REDACTED]');
    expect(result.sanitizedText).toContain('[PASSWORD_REDACTED]');
    expect(result.sanitizedText).not.toContain('SuperSecret123!');
  });

  it('should recursively sanitize JSON metadata objects', () => {
    const metadata = {
      caller: 'John Doe',
      otp: '994821',
      details: {
        nestedPassword: 'SecretPassword999',
        normalKey: 'benign value',
      },
    };

    const sanitized = PrivacyFirewall.sanitizeObject(metadata);
    expect(sanitized.otp).toBe('[AUTHENTICATION_CODE_REDACTED]');
    expect(sanitized.details.nestedPassword).toBe('[AUTHENTICATION_CODE_REDACTED]');
    expect(sanitized.details.normalKey).toBe('benign value');
  });
});
