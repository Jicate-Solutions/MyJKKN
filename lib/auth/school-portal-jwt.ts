/**
 * Schools Network HM Portal — session JWT (sign/verify).
 *
 * HMs (headmasters / principals of external + internal schools) are NOT in
 * auth.users. Their session is a self-contained HS256 JWT minted on
 * magic-link verify and stored in the `school_portal_session` HttpOnly cookie.
 *
 * Mirrors the canonical lib/auth/parent-jwt.ts pattern (`jose`, Web Crypto, safe
 * to import from both Node API routes and the Edge proxy).
 *
 * The claim shape is intentionally small:
 *   - `sub`        = school_contacts.id    (the HM's contact row id)
 *   - `schoolId`   = schools.id            (resolved at verify time)
 *   - `email`      = contact email (lowercased; re-verified per-request)
 *   - `role`       = school_contact_roles.code ('hm' | 'principal' | ...)
 *
 * Session TTL is short (24h) so a leaked cookie cannot be re-used long-term;
 * the HM can refresh by requesting a new magic link.
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export const SCHOOL_PORTAL_SESSION_COOKIE = 'school_portal_session';

const SESSION_TTL = '24h';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours, in seconds

export function schoolPortalSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

export interface SchoolPortalJwtClaims extends JWTPayload {
  sub: string; // school_contacts.id
  schoolId: string;
  email: string; // lowercased
  role: string; // school_contact_roles.code
}

function getSecret(): Uint8Array {
  // Reuse the parent-portal secret if it exists — the cookies are
  // scope-distinct (`school_portal_session` vs `parent_session`) so token
  // confusion is impossible, but a separate secret is preferred when set.
  const secret =
    process.env.SCHOOL_PORTAL_JWT_SECRET ?? process.env.PARENT_JWT_SECRET;
  if (!secret || secret.length < 16) {
    // Fail loud — a missing/short secret silently weakens every HM session.
    throw new Error(
      'SCHOOL_PORTAL_JWT_SECRET (or PARENT_JWT_SECRET fallback) is not set or is too short. Add it to .env — at least 16 chars.',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSchoolPortalSession(claims: {
  sub: string;
  schoolId: string;
  email: string;
  role: string;
}): Promise<string> {
  return new SignJWT({
    schoolId: claims.schoolId,
    email: claims.email.toLowerCase(),
    role: claims.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

/**
 * Verify a school_portal_session token. Returns the claims, or null if the
 * token is missing/expired/tampered (callers translate null → 401 / redirect
 * to /schools-portal/login).
 */
export async function verifySchoolPortalSession(
  token: string | undefined | null,
): Promise<SchoolPortalJwtClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      !payload.sub ||
      typeof payload.schoolId !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.role !== 'string'
    ) {
      return null;
    }
    return payload as SchoolPortalJwtClaims;
  } catch {
    // expired, bad signature, malformed — all map to "not authenticated"
    return null;
  }
}
