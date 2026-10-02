/**
 * lib/auth/auth-retry.ts — "nobody is signed in" vs "we could not tell".
 * Only the first may send anyone to the sign-in page.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
  type User,
} from '@supabase/supabase-js';
import {
  classifyAuthResult,
  getUserWithRetry,
  TransientAuthError,
} from '@/lib/auth/auth-retry';

const USER = { id: 'u1', email: 'a@jkkn.ac.in' } as unknown as User;

describe('classifyAuthResult', () => {
  it('a user is signed in', () => {
    expect(classifyAuthResult(USER, null)).toBe('signed-in');
  });

  it('no user and no error, or a missing session, is signed out', () => {
    expect(classifyAuthResult(null, null)).toBe('signed-out');
    expect(classifyAuthResult(null, new AuthSessionMissingError())).toBe('signed-out');
  });

  it('a definite 4xx from the auth server (revoked refresh token, bad JWT) is signed out', () => {
    expect(classifyAuthResult(null, new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'))).toBe('signed-out');
    expect(classifyAuthResult(null, new AuthApiError('invalid JWT', 401, undefined))).toBe('signed-out');
  });

  it('network failures, 5xx, timeouts, rate limits and thrown errors are retry — never signed out', () => {
    expect(classifyAuthResult(null, new AuthRetryableFetchError('fetch failed', 0))).toBe('retry');
    expect(classifyAuthResult(null, new AuthApiError('upstream', 500, undefined))).toBe('retry');
    expect(classifyAuthResult(null, new AuthApiError('slow down', 429, undefined))).toBe('retry');
    expect(classifyAuthResult(null, new AuthApiError('timeout', 408, undefined))).toBe('retry');
    expect(classifyAuthResult(null, new AuthUnknownError('bad gateway html', null))).toBe('retry');
    expect(classifyAuthResult(null, new TypeError('Failed to fetch'))).toBe('retry');
  });
});

function clientAnswering(answers: Array<{ user: User | null; error: unknown } | 'throw'>) {
  const getUser = vi.fn(async () => {
    const next = answers[Math.min(getUser.mock.calls.length - 1, answers.length - 1)];
    if (next === 'throw') throw new TypeError('Failed to fetch');
    return { data: { user: next.user }, error: next.error as any };
  });
  return { client: { auth: { getUser } }, getUser };
}

describe('getUserWithRetry', () => {
  it('retries ONCE on a retryable failure and returns the user when the retry succeeds', async () => {
    const { client, getUser } = clientAnswering([
      { user: null, error: new AuthRetryableFetchError('fetch failed', 0) },
      { user: USER, error: null },
    ]);
    await expect(getUserWithRetry(client, 0)).resolves.toBe(USER);
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('does not retry a missing session — returns null (the caller redirects to sign-in)', async () => {
    const { client, getUser } = clientAnswering([
      { user: null, error: new AuthSessionMissingError() },
    ]);
    await expect(getUserWithRetry(client, 0)).resolves.toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('throws TransientAuthError (a temporary error page), not null, when auth stays unreachable', async () => {
    const { client, getUser } = clientAnswering(['throw', 'throw', 'throw']);
    await expect(getUserWithRetry(client, 0)).rejects.toBeInstanceOf(TransientAuthError);
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
