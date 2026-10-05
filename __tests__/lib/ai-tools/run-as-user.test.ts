/**
 * lib/ai-tools/run-as-user.ts — acting AS one existing person.
 *
 * Proves: the account is fetched by id BEFORE any link is generated (so
 * generateLink can never create a new account); a missing or blocked account
 * mints nothing; the client handed back carries the person's own token and the
 * PUBLIC anon key, never the service-role key; sessions are cached per person
 * for at most 5 minutes; the account is re-read on every call, so a block
 * applied after minting stops a cached session at once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const OWNER = '11111111-2222-4333-8444-555555555555';

const getUserById = vi.fn();
const generateLink = vi.fn();
// profiles row read by the service role: { data, error } returned by maybeSingle
let profileResult: { data: unknown; error: unknown } = { data: null, error: null };
const profileSelect = vi.fn();
const profileEq = vi.fn();
function profilesBuilder() {
  const b: Record<string, unknown> = {};
  b.select = (...a: unknown[]) => {
    profileSelect(...a);
    return b;
  };
  b.eq = (...a: unknown[]) => {
    profileEq(...a);
    return b;
  };
  b.maybeSingle = async () => profileResult;
  return b;
}
const from = vi.fn((_table: string) => profilesBuilder());
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: { admin: { getUserById, generateLink } },
    from,
  })),
}));

const flags = vi.hoisted(() => ({ ENABLE_STUDENT_PORTAL: true }));
vi.mock('@/lib/config/feature-flags', () => ({ FEATURE_FLAGS: flags }));

const validateStudentAccess = vi.fn();
vi.mock('@/lib/services/auth/student-validation-service', () => ({
  StudentValidationService: {
    validateStudentAccess: (userId: string) => validateStudentAccess(userId),
  },
}));

const verifyOtp = vi.fn();
const createClient = vi.fn((_url: string, key: string, opts?: { global?: { headers?: Record<string, string> } }) => ({
  __key: key,
  __auth: opts?.global?.headers?.Authorization,
  auth: { verifyOtp },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, opts?: never) => createClient(url, key, opts),
}));

import {
  getUserSessionClient,
  RunAsUserError,
  AccountOffError,
  _resetRunAsUserCacheForTesting,
} from '@/lib/ai-tools/run-as-user';

function happyPath() {
  getUserById.mockResolvedValue({ data: { user: { id: OWNER, email: 'owner@jkkn.ac.in' } }, error: null });
  profileResult = { data: { is_active: true, is_login_disabled: false, role: 'faculty' }, error: null };
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'th-1' } }, error: null });
  verifyOtp.mockResolvedValue({
    data: {
      session: {
        access_token: 'owner-access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: OWNER },
      },
    },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.ENABLE_STUDENT_PORTAL = true;
  profileResult = { data: null, error: null };
  _resetRunAsUserCacheForTesting();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getUserSessionClient', () => {
  it('fetches the account by id first, then mints a magic-link session for THAT email', async () => {
    happyPath();
    await getUserSessionClient(OWNER);
    expect(getUserById).toHaveBeenCalledWith(OWNER);
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'owner@jkkn.ac.in' });
    expect(getUserById.mock.invocationCallOrder[0]).toBeLessThan(generateLink.mock.invocationCallOrder[0]);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'th-1', type: 'magiclink' });
  });

  it('returns a client on the anon key carrying the person’s own token — never the service role', async () => {
    happyPath();
    const client = (await getUserSessionClient(OWNER)) as unknown as { __key: string; __auth: string };
    expect(client.__key).toBe('public-anon-key');
    expect(client.__auth).toBe('Bearer owner-access-token');
    for (const [, key] of createClient.mock.calls) expect(key).not.toBe('service-role-secret');
  });

  it('never generates a link when the account does not exist', async () => {
    getUserById.mockResolvedValue({ data: { user: null }, error: { message: 'User not found' } });
    await expect(getUserSessionClient(OWNER)).rejects.toBeInstanceOf(RunAsUserError);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('refuses a blocked account', async () => {
    getUserById.mockResolvedValue({
      data: { user: { id: OWNER, email: 'owner@jkkn.ac.in', banned_until: '2999-01-01T00:00:00Z' } },
      error: null,
    });
    await expect(getUserSessionClient(OWNER)).rejects.toBeInstanceOf(RunAsUserError);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('refuses a session that belongs to somebody else', async () => {
    happyPath();
    verifyOtp.mockResolvedValue({
      data: { session: { access_token: 't', expires_at: null, user: { id: 'someone-else' } } },
      error: null,
    });
    await expect(getUserSessionClient(OWNER)).rejects.toBeInstanceOf(RunAsUserError);
  });

  it('reuses one session per person for up to 5 minutes, then mints again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z'));
    happyPath();
    await getUserSessionClient(OWNER);
    await getUserSessionClient(OWNER);
    expect(generateLink).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-23T10:05:01Z'));
    await getUserSessionClient(OWNER);
    expect(generateLink).toHaveBeenCalledTimes(2);
  });

  it('re-reads the account on a cached session: an account blocked after minting stops at once', async () => {
    happyPath();
    await getUserSessionClient(OWNER);
    expect(generateLink).toHaveBeenCalledTimes(1);

    getUserById.mockResolvedValue({
      data: { user: { id: OWNER, email: 'owner@jkkn.ac.in', banned_until: '2999-01-01T00:00:00Z' } },
      error: null,
    });
    await expect(getUserSessionClient(OWNER)).rejects.toBeInstanceOf(RunAsUserError);
    expect(generateLink).toHaveBeenCalledTimes(1);

    // the cached session was dropped: once unblocked, a NEW session is minted
    happyPath();
    await getUserSessionClient(OWNER);
    expect(generateLink).toHaveBeenCalledTimes(2);
  });
});

describe('an account switched off in MyJKKN (not only a GoTrue ban) is refused on every call', () => {
  async function expectRefused() {
    const err = await getUserSessionClient(OWNER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccountOffError);
    expect(err).toBeInstanceOf(RunAsUserError);
    // one generic message: nothing says which rule refused
    expect((err as Error).message).toBe('Account is not active');
    expect(generateLink).not.toHaveBeenCalled();
  }

  it('reads the profile by id with the service-role client', async () => {
    happyPath();
    await getUserSessionClient(OWNER);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(profileSelect).toHaveBeenCalledWith('is_active, is_login_disabled, role');
    expect(profileEq).toHaveBeenCalledWith('id', OWNER);
  });

  it('refuses profiles.is_active = false', async () => {
    happyPath();
    profileResult = { data: { is_active: false, is_login_disabled: false, role: 'faculty' }, error: null };
    await expectRefused();
  });

  it('refuses profiles.is_login_disabled = true', async () => {
    happyPath();
    profileResult = { data: { is_active: true, is_login_disabled: true, role: 'staff' }, error: null };
    await expectRefused();
  });

  it('refuses auth user_metadata.account_disabled = true (the proxy.ts rule)', async () => {
    happyPath();
    getUserById.mockResolvedValue({
      data: { user: { id: OWNER, email: 'owner@jkkn.ac.in', user_metadata: { account_disabled: true } } },
      error: null,
    });
    await expectRefused();
  });

  it('refuses when the profile read errors (fails closed)', async () => {
    happyPath();
    profileResult = { data: null, error: { message: 'timeout' } };
    await expectRefused();
  });

  it('refuses when there is no profile row (fails closed)', async () => {
    happyPath();
    profileResult = { data: null, error: null };
    await expectRefused();
  });

  it('refuses a learner whose lifecycle status is blocked (e.g. exited)', async () => {
    happyPath();
    profileResult = { data: { is_active: true, is_login_disabled: false, role: 'student' }, error: null };
    validateStudentAccess.mockResolvedValue({
      allowed: false,
      accessTier: 'none',
      reason: 'student_exited',
      status: 'exited',
      isGraduated: false,
    });
    await expectRefused();
    expect(validateStudentAccess).toHaveBeenCalledWith(OWNER);
  });

  it('refuses an induction-only learner (the door is not on their whitelist)', async () => {
    happyPath();
    profileResult = { data: { is_active: true, is_login_disabled: false, role: 'student' }, error: null };
    validateStudentAccess.mockResolvedValue({
      allowed: false,
      accessTier: 'induction_only',
      reason: 'student_induction_only',
      status: 'admitted',
      isGraduated: false,
    });
    await expectRefused();
  });

  it('refuses every learner while the learner portal flag is off (proxy.ts rule)', async () => {
    happyPath();
    flags.ENABLE_STUDENT_PORTAL = false;
    profileResult = { data: { is_active: true, is_login_disabled: false, role: 'student' }, error: null };
    validateStudentAccess.mockResolvedValue({ allowed: true, accessTier: 'full', reason: 'access_granted', isGraduated: false });
    await expectRefused();
  });

  it('allows an active learner with full access', async () => {
    happyPath();
    profileResult = { data: { is_active: true, is_login_disabled: false, role: 'student' }, error: null };
    validateStudentAccess.mockResolvedValue({ allowed: true, accessTier: 'full', reason: 'access_granted', isGraduated: false });
    await expect(getUserSessionClient(OWNER)).resolves.toBeTruthy();
    expect(generateLink).toHaveBeenCalledTimes(1);
  });

  it('allows a normal active account (and never asks the learner check for team members)', async () => {
    happyPath();
    await expect(getUserSessionClient(OWNER)).resolves.toBeTruthy();
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(validateStudentAccess).not.toHaveBeenCalled();
  });

  it('a person deactivated AFTER a session was minted is refused on the next call, from cache', async () => {
    happyPath();
    await getUserSessionClient(OWNER);
    expect(generateLink).toHaveBeenCalledTimes(1);

    profileResult = { data: { is_active: false, is_login_disabled: false, role: 'faculty' }, error: null };
    await expect(getUserSessionClient(OWNER)).rejects.toBeInstanceOf(AccountOffError);
    expect(generateLink).toHaveBeenCalledTimes(1);
  });
});
