/**
 * SF100 external mentor/investor — session JWT (sign/verify)
 *
 * External mentors and investors have NO JKKN (Supabase) account. Their session
 * is an `sf100_external_session` HttpOnly cookie holding a `jose`-signed HS256
 * JWT — the SAME isolated-portal pattern the parent portal uses (lib/auth/parent-jwt.ts),
 * deliberately kept separate from staff Supabase Google SSO.
 *
 * The payload embeds ONLY the external contact's id (ss_mentors.id). The list of
 * teams they can reach is resolved PER-REQUEST from ss_mentor_matches
 * (see lib/utils/external-access.ts) so assigning/removing a team never stales
 * the token. An `aud: 'sf100_external'` claim hard-isolates these tokens from any
 * other portal that might share the signing secret.
 *
 * Runtime note: uses `jose` (Web Crypto), safe to import from Node routes and Edge.
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export const EXTERNAL_SESSION_COOKIE = 'sf100_external_session';
const EXTERNAL_AUDIENCE = 'sf100_external';

// 7-day session — external assignments are shorter-lived than a parent link, and
// a coordinator can revoke the underlying access code at any time (is_active=false).
const SESSION_TTL = '7d';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

/** Cookie options for the external session cookie (HttpOnly, 7-day). */
export function externalSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

/** Cookie options that immediately clear the session (logout). */
export function externalSessionClearOptions() {
  return { ...externalSessionCookieOptions(), maxAge: 0 };
}

export interface ExternalJwtClaims extends JWTPayload {
  sub: string; // ss_mentors.id (the external contact / investor)
}

/**
 * The signing secret. Prefers a dedicated SF100_EXTERNAL_JWT_SECRET so ops can
 * rotate it independently, and falls back to the already-provisioned
 * PARENT_JWT_SECRET so the feature works day one. The `aud` claim (below) keeps
 * the two portals isolated even when they share this secret.
 */
function getSecret(): Uint8Array {
  const secret =
    process.env.SF100_EXTERNAL_JWT_SECRET || process.env.PARENT_JWT_SECRET;
  if (!secret || secret.length < 16) {
    // Fail loud — a missing/short secret silently weakens every external session.
    throw new Error(
      'Neither SF100_EXTERNAL_JWT_SECRET nor PARENT_JWT_SECRET is set (or too short). Add one to .env.'
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signExternalSession(claims: {
  sub: string;
}): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setAudience(EXTERNAL_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

/**
 * Verify an external session token. Returns the claims, or null if the token is
 * missing/expired/tampered/wrong-audience (callers translate null → 401 / login).
 */
export async function verifyExternalSession(
  token: string | undefined | null
): Promise<ExternalJwtClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      audience: EXTERNAL_AUDIENCE,
    });
    if (!payload.sub) return null;
    return payload as ExternalJwtClaims;
  } catch {
    // expired, bad signature, wrong audience, malformed — all → not authenticated
    return null;
  }
}
