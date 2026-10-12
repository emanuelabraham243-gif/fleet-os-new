/** Sign-in rules shared by the forms (client) and the server actions. No secrets in here. */

export const PASSWORD_MIN = 8;
// bcrypt (used by the auth provider) only looks at the first 72 bytes.
export const PASSWORD_MAX_BYTES = 72;

export type PasswordError = 'passwordTooShort' | 'passwordTooLong' | 'passwordMismatch';

/** Length only -- no symbol/uppercase rules. Returns an `errors.*` key or null. */
export function checkNewPassword(password: string, confirm: string): PasswordError | null {
  if (password.length < PASSWORD_MIN) return 'passwordTooShort';
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return 'passwordTooLong';
  if (password !== confirm) return 'passwordMismatch';
  return null;
}

export const RESET_CODE_LENGTH = 6;

/** Exactly 6 digits after removing spaces (people sometimes type "123 456"). */
export function cleanResetCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.replace(/\s/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}
