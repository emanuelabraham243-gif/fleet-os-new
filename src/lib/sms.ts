import { createHmac, randomInt } from 'node:crypto';

/**
 * SMS sending. Single swap point: getSmsSender().
 *
 * Off until an SMS service is bought: with SMS_PROVIDER unset nothing is ever sent, and the
 * forgot-password screen tells people to ask the owner for a temporary password instead.
 * To turn it on (AfroMessage): SMS_PROVIDER=afromessage, AFROMESSAGE_TOKEN,
 * AFROMESSAGE_IDENTIFIER_ID, AFROMESSAGE_SENDER, and AUTH_CODE_SECRET (any long random string).
 */
export interface SmsSender {
  readonly name: string;
  send(toE164: string, text: string): Promise<boolean>;
}

class AfroMessageSender implements SmsSender {
  readonly name = 'afromessage';
  constructor(
    private token: string,
    private identifierId: string,
    private sender: string,
  ) {}

  async send(toE164: string, text: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.afromessage.com/api/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.identifierId, sender: this.sender, to: toE164, message: text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return false;
      const body = (await res.json().catch(() => null)) as { acknowledge?: string } | null;
      return body?.acknowledge === 'success';
    } catch {
      // Never log the message: it contains the code.
      return false;
    }
  }
}

export function getSmsSender(env: NodeJS.ProcessEnv = process.env): SmsSender | null {
  if (env.SMS_PROVIDER !== 'afromessage') return null;
  const { AFROMESSAGE_TOKEN, AFROMESSAGE_IDENTIFIER_ID, AFROMESSAGE_SENDER, AUTH_CODE_SECRET } = env;
  if (!AFROMESSAGE_TOKEN || !AFROMESSAGE_IDENTIFIER_ID || !AFROMESSAGE_SENDER || !AUTH_CODE_SECRET) return null;
  return new AfroMessageSender(AFROMESSAGE_TOKEN, AFROMESSAGE_IDENTIFIER_ID, AFROMESSAGE_SENDER);
}

export function smsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getSmsSender(env) !== null;
}

/** Short on purpose: one Amharic SMS segment holds about 70 characters. */
export function resetCodeMessage(code: string): string {
  return `FleetOS የማረጋገጫ ኮድ: ${code}። ለማንም አያካፍሉ።`;
}

export function generateResetCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** HMAC so a leaked table cannot be brute-forced offline (only 10^6 possible codes). */
export function hashResetCode(phoneE164: string, code: string, secret = process.env.AUTH_CODE_SECRET): string {
  if (!secret) throw new Error('AUTH_CODE_SECRET is not configured');
  return createHmac('sha256', secret).update(`${phoneE164}:${code}`).digest('hex');
}
