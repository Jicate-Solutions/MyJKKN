/**
 * Telling "nobody is signed in" apart from "we could not tell who is signed in".
 *
 * Supabase auth answers both in the same shape — `{ user: null, error }` — and
 * every place that treated the second like the first sent a signed-in person to
 * the sign-in page on a single dropped request (Director ruling, 1 Oct 2026:
 * "once they log in, it never logs out at all in the PWA").
 *
 * No `next/headers`, no React: the proxy, server pages and the client root page
 * all import this file.
 */
import {
  isAuthApiError,
  isAuthSessionMissingError,
  type AuthError,
  type User,
} from '@supabase/supabase-js';

export type AuthVerdict = 'signed-in' | 'signed-out' | 'retry';

/** Auth API statuses that are a definite answer about the session. 408 and 429
 *  are "try again later", not "you are not signed in". */
function isDefinitiveAuthStatus(status: unknown): boolean {
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

/**
 * Classify one getUser() outcome.
 *
 * - a user                                   → 'signed-in'
 * - no user and no error                     → 'signed-out'
 * - AuthSessionMissingError                  → 'signed-out' (no session cookie)
 * - an Auth API 4xx (revoked refresh token,
 *   invalid JWT, banned user)                → 'signed-out' (the server said so)
 * - anything else — fetch failure, 5xx,
 *   timeout, 408/429, a thrown exception     → 'retry' (we simply do not know)
 */
export function classifyAuthResult(
  user: User | null | undefined,
  error: unknown
): AuthVerdict {
  if (user) return 'signed-in';
  if (!error) return 'signed-out';
  if (isAuthSessionMissingError(error)) return 'signed-out';
  if (isAuthApiError(error) && isDefinitiveAuthStatus(error.status)) {
    return 'signed-out';
  }
  return 'retry';
}

/** Thrown by getUserWithRetry when auth could not be reached twice in a row.
 *  The route's error boundary renders it as a "try again" page — the session
 *  cookies are untouched, so the next attempt picks up where this one left off. */
export class TransientAuthError extends Error {
  constructor(cause: unknown) {
    super('Could not confirm who is signed in. Please try again.', { cause });
    this.name = 'TransientAuthError';
  }
}

interface GetUserClient {
  auth: {
    getUser(): Promise<{
      data: { user: User | null };
      error: AuthError | null;
    }>;
  };
}

async function readUser(
  supabase: GetUserClient
): Promise<{ user: User | null; error: unknown }> {
  try {
    const { data, error } = await supabase.auth.getUser();
    return { user: data?.user ?? null, error };
  } catch (error) {
    return { user: null, error };
  }
}

/**
 * getUser() with ONE retry on a retryable failure.
 *
 * Returns the user, or null when there is truly no session (redirect to sign-in
 * is right). Throws TransientAuthError when auth stayed unreachable — callers
 * must NOT treat that as signed out.
 */
export async function getUserWithRetry(
  supabase: GetUserClient,
  retryDelayMs = 200
): Promise<User | null> {
  let attempt = await readUser(supabase);
  let verdict = classifyAuthResult(attempt.user, attempt.error);

  if (verdict === 'retry') {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    attempt = await readUser(supabase);
    verdict = classifyAuthResult(attempt.user, attempt.error);
  }

  if (verdict === 'signed-in') return attempt.user;
  if (verdict === 'signed-out') return null;
  throw new TransientAuthError(attempt.error);
}
