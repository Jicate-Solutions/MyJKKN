/**
 * lib/ai-tools/run-as-user.ts — acting AS one existing person.
 *
 * Proves: the account is fetched by id BEFORE any link is generated (so
 * generateLink can never create a new account); a missing or blocked account
 * mints nothing; the client handed back carries the person's own token and the
 * PUBLIC anon key, never the service-role key; sessions are cached per person
 * for at most 5 minutes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const OWNER = '11111111-2222-4333-8444-555555555555';

const getUserById = vi.fn();
const generateLink = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: { admin: { getUserById, generateLink } },
  })),
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
  _resetRunAsUserCacheForTesting,
} from '@/lib/ai-tools/run-as-user';

function happyPath() {
  getUserById.mockResolvedValue({ data: { user: { id: OWNER, email: 'owner@jkkn.ac.in' } }, error: null });
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
});
