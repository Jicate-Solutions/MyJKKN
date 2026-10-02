/**
 * Parent Portal — session JWT (sign/verify)
 *
 * The parent portal is fully isolated from staff Supabase Google SSO. A parent's
 * session is a `parent_session` HttpOnly cookie holding a `jose`-signed HS256 JWT.
 *
 * The payload deliberately does NOT embed the learner list — siblings can be
 * added later, which would stale the token. `learnerIds` are resolved per-request
 * from pp_parent_learner_links (see lib/utils/parent-access.ts).
 *
 * Runtime note: uses `jose` (Web Crypto), so this module is safe to import from
 * both the Node API routes and the Edge proxy (proxy.ts).
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export const PARENT_SESSION_COOKIE = 'parent_session';
export const PARENT_ACTIVE_LEARNER_COOKIE = 'pp_active_learner';

// Session lifetime (Director ruling, 1 Oct 2026: once a parent logs in to the
// installed app it should never log them out). The token SLIDES: proxy.ts
// re-issues it once it is older than PARENT_SESSION_RENEW_AFTER_SECONDS, so a
// parent who opens the app at least once every 400 days is never signed out.
// 400 days is the longest value browsers honour — Chrome silently caps a
// cookie's Max-Age at 400 days, so anything longer would only be a fiction.
// One constant drives both the JWT `exp` and the cookie maxAge.
const SESSION_MAX_AGE = 60 * 60 * 24 * 400; // 400 days, in seconds

/** Re-issue the session once it is older than this (seconds). */
export const PARENT_SESSION_RENEW_AFTER_SECONDS = 60 * 60 * 24; // 1 day

/** Cookie options for the parent_session cookie (HttpOnly, 400-day, sliding). */
export function parentSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

export interface ParentJwtClaims extends JWTPayload {
  sub: string; // pp_parent_accounts.id (one per student)
  learnerProfileId: string; // the student this account belongs to
}

function getSecret(): Uint8Array {
  const secret = process.env.PARENT_JWT_SECRET;
  if (!secret || secret.length < 16) {
    // Fail loud — a missing/short secret silently weakens every parent session.
    throw new Error(
      'PARENT_JWT_SECRET is not set (or too short). Add it to .env — see .env.example.'
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signParentSession(claims: {
  sub: string;
  learnerProfileId: string;
}): Promise<string> {
  return new SignJWT({ learnerProfileId: claims.learnerProfileId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

/**
 * True when a VERIFIED session should be re-issued: it was issued more than
 * PARENT_SESSION_RENEW_AFTER_SECONDS ago (or carries no `iat`). A fresh token
 * is left alone, so at most one new cookie is written per parent per day.
 */
export function shouldRenewParentSession(
  claims: ParentJwtClaims,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (typeof claims.iat !== 'number') return true;
  return nowSeconds - claims.iat > PARENT_SESSION_RENEW_AFTER_SECONDS;
}

/**
 * "Sign out everywhere": pp_parent_accounts.sessions_revoked_at kills every
 * token issued at or before that moment. `iat` has one-second granularity, so
 * the comparison is `<=` — a token minted in the same second as the revoke is
 * also dead (the parent simply logs in again).
 */
export function isParentSessionRevoked(
  claims: ParentJwtClaims,
  sessionsRevokedAt: string | null | undefined
): boolean {
  if (!sessionsRevokedAt) return false;
  const revokedMs = Date.parse(sessionsRevokedAt);
  if (Number.isNaN(revokedMs)) return false;
  if (typeof claims.iat !== 'number') return true;
  return claims.iat * 1000 <= revokedMs;
}

/**
 * Verify a parent_session token. Returns the claims, or null if the token is
 * missing/expired/tampered (callers translate null → 401 / redirect to login).
 */
export async function verifyParentSession(
  token: string | undefined | null
): Promise<ParentJwtClaims | null> {
  if (!token) return null;
  try {
    // Pin verification to the one algorithm we sign with (see signParentSession).
    // Without an explicit allowlist, the verifier accepts any algorithm the
    // library supports for this key type — the door for algorithm-confusion.
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    if (!payload.sub || typeof payload.learnerProfileId !== 'string') return null;
    return payload as ParentJwtClaims;
  } catch {
    // expired, bad signature, malformed — all map to "not authenticated"
    return null;
  }
}
