import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- fakes for Next and Supabase -------------------------------------------------------------
class Redirect extends Error {
  constructor(public url: string) {
    super('NEXT_REDIRECT');
  }
}
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn() }) }));

type Row = Record<string, unknown>;
const db: { members: Row[]; profiles: Row[] } = { members: [], profiles: [] };
const rpc = vi.fn();
const createUser = vi.fn();
const updateUserById = vi.fn();
const signInWithPassword = vi.fn();
const sms = { send: vi.fn(), name: 'fake' };
let smsOn = true;

function table(rows: () => Row[]) {
  const filters: [string, unknown][] = [];
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return q;
    },
    maybeSingle: async () => ({ data: rows().find((r) => filters.every(([c, v]) => r[c] === v)) ?? null }),
  };
  return q;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (name: string) => table(() => (name === 'org_phone_members' ? db.members : db.profiles)),
    rpc,
    auth: { admin: { createUser, updateUserById } },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signInWithPassword },
    from: () => table(() => []),
  }),
}));
vi.mock('@/lib/sms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sms')>()),
  getSmsSender: () => (smsOn ? sms : null),
}));

const { signIn, signUp, requestReset, completeReset } = await import('./actions');

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
async function run<T>(p: Promise<T>): Promise<T | { redirect: string }> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof Redirect) return { redirect: e.url };
    throw e;
  }
}

const ORG = 'org-1';
beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_CODE_SECRET = 'test-secret';
  smsOn = true;
  db.members = [{ phone: '+251911223344', organization_id: ORG, role: 'admin', full_name: 'Bereket', user_id: null }];
  db.profiles = [];
  rpc.mockResolvedValue({ data: null });
  createUser.mockResolvedValue({ error: null });
  updateUserById.mockResolvedValue({ error: null });
  signInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

// ---- sign up ----------------------------------------------------------------------------------
describe('signUp', () => {
  it.each(['0911223344', '911223344', '+251911223344', '251911223344', '0911 223 344'])(
    'stores %j as +251911223344 and signs in',
    async (phone) => {
      const res = await run(signUp({}, form({ phone, password: 'abebe1234', confirm: 'abebe1234' })));
      expect(res).toEqual({ redirect: '/' });
      expect(createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '+251911223344',
          phone_confirm: true,
          app_metadata: { organization_id: ORG, role: 'admin' },
        }),
      );
      expect(rpc).toHaveBeenCalledWith('auth_audit', { p_user: 'user-1', p_action: 'SIGN_UP' });
    },
  );

  it('rejects a number that already has an account', async () => {
    db.members[0].user_id = 'someone';
    const res = await run(signUp({}, form({ phone: '0911223344', password: 'abebe1234', confirm: 'abebe1234' })));
    expect(res).toMatchObject({ error: 'auth.phoneTaken' });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects when the auth provider already has the number', async () => {
    createUser.mockResolvedValue({ error: { code: 'phone_exists' } });
    const res = await run(signUp({}, form({ phone: '0911223344', password: 'abebe1234', confirm: 'abebe1234' })));
    expect(res).toMatchObject({ error: 'auth.phoneTaken' });
  });

  it('refuses a number that is on no organization list (no account created)', async () => {
    const res = await run(signUp({}, form({ phone: '0922000000', password: 'abebe1234', confirm: 'abebe1234' })));
    expect(res).toMatchObject({ error: 'auth.notListed' });
    expect(createUser).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects an invalid number', async () => {
    const res = await run(signUp({}, form({ phone: '0111223344', password: 'abebe1234', confirm: 'abebe1234' })));
    expect(res).toMatchObject({ fieldErrors: { phone: 'phoneInvalid' } });
  });

  it('rejects a mismatched confirmation on the server', async () => {
    const res = await run(signUp({}, form({ phone: '0911223344', password: 'abebe1234', confirm: 'abebe9999' })));
    expect(res).toMatchObject({ fieldErrors: { confirm: 'passwordMismatch' } });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a short password', async () => {
    const res = await run(signUp({}, form({ phone: '0911223344', password: 'short', confirm: 'short' })));
    expect(res).toMatchObject({ fieldErrors: { password: 'passwordTooShort' } });
  });
});

// ---- sign in ----------------------------------------------------------------------------------
describe('signIn', () => {
  it('signs in with phone + password and records the success', async () => {
    const res = await run(signIn({}, form({ phone: '0911223344', password: 'abebe1234' })));
    expect(res).toEqual({ redirect: '/' });
    expect(signInWithPassword).toHaveBeenCalledWith({ phone: '+251911223344', password: 'abebe1234' });
    expect(rpc).toHaveBeenCalledWith('auth_login_record', { p_phone: '+251911223344', p_success: true });
    expect(rpc).toHaveBeenCalledWith('auth_audit', { p_user: 'user-1', p_action: 'SIGN_IN' });
  });

  it('does not even try while the number is paused', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'auth_login_locked_until' ? { data: '2026-10-12T10:15:00Z' } : { data: null },
    );
    const res = await run(signIn({}, form({ phone: '0911223344', password: 'abebe1234' })));
    expect(res).toMatchObject({ error: 'auth.tooManyTries' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('wrong password: generic message, failure recorded; the 5th one pauses', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } });
    const wrong = await run(signIn({}, form({ phone: '0911223344', password: 'nope-nope' })));
    expect(wrong).toMatchObject({ error: 'auth.invalidCreds' });
    expect(rpc).toHaveBeenCalledWith('auth_login_record', { p_phone: '+251911223344', p_success: false });

    rpc.mockImplementation(async (name: string) =>
      name === 'auth_login_record' ? { data: '2026-10-12T10:15:00Z' } : { data: null },
    );
    const fifth = await run(signIn({}, form({ phone: '0911223344', password: 'nope-nope' })));
    expect(fifth).toMatchObject({ error: 'auth.tooManyTries' });
  });

  it('never echoes the password back', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: {} });
    const res = await run(signIn({}, form({ phone: '0911223344', password: 'secret-pass' })));
    expect(JSON.stringify(res)).not.toContain('secret-pass');
  });
});

// ---- forgot password --------------------------------------------------------------------------
describe('requestReset', () => {
  it('gives the same answer for unknown and known numbers', async () => {
    const unknown = await run(requestReset({}, form({ phone: '0922000000' })));
    db.profiles = [{ id: 'user-1', phone_e164: '+251911223344' }];
    rpc.mockImplementation(async (name: string) => (name === 'auth_reset_request' ? { data: 'ok' } : { data: null }));
    const known = await run(requestReset({}, form({ phone: '0911223344' })));
    expect(unknown).toEqual({ ok: true, values: { phone: '+251922000000' } });
    expect(known).toEqual({ ok: true, values: { phone: '+251911223344' } });
  });

  it('sends the code by SMS only for an existing account, and never returns it', async () => {
    db.profiles = [{ id: 'user-1', phone_e164: '+251911223344' }];
    rpc.mockImplementation(async (name: string) => (name === 'auth_reset_request' ? { data: 'ok' } : { data: null }));
    const res = await run(requestReset({}, form({ phone: '0911223344' })));
    expect(sms.send).toHaveBeenCalledTimes(1);
    const [to, text] = sms.send.mock.calls[0];
    expect(to).toBe('+251911223344');
    const code = /(\d{6})/.exec(text)![1];
    expect(JSON.stringify(res)).not.toContain(code);
    const stored = rpc.mock.calls.find(([n]) => n === 'auth_reset_request')![1];
    expect(stored.p_code_hash).not.toContain(code); // only the hash is stored
    expect(rpc).toHaveBeenCalledWith('auth_audit', { p_user: 'user-1', p_action: 'RESET_REQUEST' });
  });

  it('sends nothing when rate-limited, with the same answer', async () => {
    db.profiles = [{ id: 'user-1', phone_e164: '+251911223344' }];
    rpc.mockImplementation(async (name: string) =>
      name === 'auth_reset_request' ? { data: 'rate_limited' } : { data: null },
    );
    const res = await run(requestReset({}, form({ phone: '0911223344' })));
    expect(res).toEqual({ ok: true, values: { phone: '+251911223344' } });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('tells people to ask the owner while no SMS service is configured', async () => {
    smsOn = false;
    const res = await run(requestReset({}, form({ phone: '0911223344' })));
    expect(res).toMatchObject({ error: 'auth.smsUnavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('completeReset', () => {
  const good = { phone: '+251911223344', code: '123456', password: 'newpass123', confirm: 'newpass123' };
  beforeEach(() => {
    db.profiles = [{ id: 'user-1', phone_e164: '+251911223344' }];
  });

  it('right code: sets the password, signs out every session, then signs in here', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'auth_reset_verify' ? { data: 'ok' } : { data: null }));
    const res = await run(completeReset({}, form(good)));
    expect(res).toEqual({ redirect: '/' });
    expect(updateUserById).toHaveBeenCalledWith('user-1', { password: 'newpass123' });
    const order = rpc.mock.calls.map(([n]) => n);
    expect(order.indexOf('auth_revoke_sessions')).toBeGreaterThan(order.indexOf('auth_reset_verify'));
    expect(rpc).toHaveBeenCalledWith('auth_revoke_sessions', { p_user: 'user-1' });
    expect(signInWithPassword).toHaveBeenCalledAfter(updateUserById);
    expect(rpc).toHaveBeenCalledWith('auth_audit', { p_user: 'user-1', p_action: 'RESET_COMPLETE' });
  });

  it.each([
    ['wrong, expired or already used code', 'invalid', 'auth.codeInvalid'],
    ['5 wrong tries', 'blocked', 'auth.codeBlocked'],
  ])('%s: refused, password unchanged', async (_label, verify, error) => {
    rpc.mockImplementation(async (name: string) => (name === 'auth_reset_verify' ? { data: verify } : { data: null }));
    const res = await run(completeReset({}, form(good)));
    expect(res).toMatchObject({ error });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('auth_revoke_sessions', expect.anything());
  });

  it('checks the confirmation before using up a code attempt', async () => {
    const res = await run(completeReset({}, form({ ...good, confirm: 'different1' })));
    expect(res).toMatchObject({ fieldErrors: { confirm: 'passwordMismatch' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed code without a database call', async () => {
    const res = await run(completeReset({}, form({ ...good, code: '12ab' })));
    expect(res).toMatchObject({ fieldErrors: { code: 'codeInvalid' } });
    expect(rpc).not.toHaveBeenCalled();
  });
});
