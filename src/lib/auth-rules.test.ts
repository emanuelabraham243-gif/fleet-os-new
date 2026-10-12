import { describe, expect, it } from 'vitest';
import { checkNewPassword, cleanResetCode } from './auth-rules';
import { generateResetCode, getSmsSender, hashResetCode, resetCodeMessage, smsEnabled } from './sms';

describe('checkNewPassword (same rule in the browser and on the server)', () => {
  it('accepts 8+ characters with no symbol/uppercase rules', () => {
    expect(checkNewPassword('abebe123', 'abebe123')).toBeNull();
    expect(checkNewPassword('12345678', '12345678')).toBeNull();
    expect(checkNewPassword('የይለፍቃልአስር', 'የይለፍቃልአስር')).toBeNull();
  });
  it('rejects short passwords', () => {
    expect(checkNewPassword('1234567', '1234567')).toBe('passwordTooShort');
  });
  it('rejects a confirmation that does not match', () => {
    expect(checkNewPassword('abebe1234', 'abebe1243')).toBe('passwordMismatch');
    expect(checkNewPassword('abebe1234', '')).toBe('passwordMismatch');
  });
  it('rejects passwords longer than bcrypt reads (72 bytes)', () => {
    const long = 'ሀ'.repeat(25); // 3 bytes each = 75 bytes
    expect(checkNewPassword(long, long)).toBe('passwordTooLong');
  });
});

describe('reset codes', () => {
  it('cleans a typed code to exactly 6 digits', () => {
    expect(cleanResetCode('123456')).toBe('123456');
    expect(cleanResetCode(' 123 456 ')).toBe('123456');
    expect(cleanResetCode('12345')).toBeNull();
    expect(cleanResetCode('1234567')).toBeNull();
    expect(cleanResetCode('12345a')).toBeNull();
    expect(cleanResetCode(null)).toBeNull();
  });

  it('generates 6-digit codes', () => {
    for (let i = 0; i < 200; i++) expect(generateResetCode()).toMatch(/^\d{6}$/);
  });

  it('hashes with a secret, per number, never returning the code', () => {
    const a = hashResetCode('+251911223344', '123456', 'secret-1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('123456');
    expect(hashResetCode('+251911223344', '123456', 'secret-1')).toBe(a);
    expect(hashResetCode('+251911223344', '123457', 'secret-1')).not.toBe(a);
    expect(hashResetCode('+251911223345', '123456', 'secret-1')).not.toBe(a);
    expect(hashResetCode('+251911223344', '123456', 'secret-2')).not.toBe(a);
    expect(() => hashResetCode('+251911223344', '123456', '')).toThrow();
  });

  it('keeps the Amharic SMS within one segment (~70 characters)', () => {
    const text = resetCodeMessage('123456');
    expect(text).toContain('123456');
    expect([...text].length).toBeLessThanOrEqual(70);
  });
});

describe('SMS switch', () => {
  it('is off (nothing is sent) until a provider is fully configured', () => {
    expect(smsEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(getSmsSender({ SMS_PROVIDER: 'afromessage' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(
      smsEnabled({
        SMS_PROVIDER: 'afromessage',
        AFROMESSAGE_TOKEN: 't',
        AFROMESSAGE_IDENTIFIER_ID: 'i',
        AFROMESSAGE_SENDER: 'FleetOS',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false); // AUTH_CODE_SECRET missing
    expect(
      smsEnabled({
        SMS_PROVIDER: 'afromessage',
        AFROMESSAGE_TOKEN: 't',
        AFROMESSAGE_IDENTIFIER_ID: 'i',
        AFROMESSAGE_SENDER: 'FleetOS',
        AUTH_CODE_SECRET: 's',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
