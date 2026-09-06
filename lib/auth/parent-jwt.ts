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

// 30-day session (matches the cookie maxAge set on the login response).
const SESSION_TTL = '30d';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

/** Cookie options for the parent_session cookie (HttpOnly, 30-day). */
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
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
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
