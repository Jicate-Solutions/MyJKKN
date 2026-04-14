// lib/auth/preview-session.ts
// ============================================================================
// "See As User" preview session — JWT mint/verify + audit helpers.
// ============================================================================
//
// Security model (v1 — super-admin-only):
//
// 1. Only users with `is_super_admin = true` can START a preview session.
// 2. Token is a signed JWT (HS256, SUPABASE_JWT_SECRET) with:
//      - sub: the TARGET user's id     (who we're previewing as)
//      - originator: the INITIATING super admin's id
//      - mode: 'read' | 'write'        (write is director@jkkn.ac.in ONLY)
//      - sessionId: random UUID        (for audit correlation)
//      - iat / exp                     (15-minute hard expiry)
//      - role: 'preview'               (distinct from normal 'authenticated')
//
// 3. Token is delivered via a secure httpOnly cookie (sb-preview-session).
//    The browser sends it on every request; API routes read it inside withAuth.
//
// 4. Mutation blocking: when mode === 'read', withAuth returns 403 on any
//    non-GET/HEAD request. This means CRUD APIs cannot be called during
//    read-only preview — the UI can still render, but destructive actions
//    fail loudly and get logged.
//
// 5. Audit trail: start, end, and every blocked mutation are written to
//    role_audit_log with a plain-English description.
//
// 6. Write mode: restricted to exactly one email (DIRECTOR_EMAIL). Even if
//    a forged token carried mode='write', the final check in withAuth
//    requires the originator's profile.email to match — defense in depth.
// ============================================================================

import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'

// ── Constants ────────────────────────────────────────────────────────────────

/** Email allowed to use WRITE mode. All other super admins are read-only. */
export const DIRECTOR_EMAIL = 'director@jkkn.ac.in'

/** Cookie name carrying the preview JWT. */
export const PREVIEW_COOKIE_NAME = 'sb-preview-session'

/** Hard maximum preview session lifetime. */
const PREVIEW_TTL_SECONDS = 15 * 60

/** Issuer string stored in JWT for defense in depth. */
const PREVIEW_ISSUER = 'myjkkn-preview'

// ── Types ────────────────────────────────────────────────────────────────────

export type PreviewMode = 'read' | 'write'

export interface PreviewClaims {
  /** Target user being previewed (the impersonated sub). */
  sub: string
  /** Super admin who initiated the preview. */
  originator: string
  /** Originator's email — checked on every mutation for defense in depth. */
  originator_email: string
  /** 'read' blocks mutations; 'write' is director-only. */
  mode: PreviewMode
  /** Random per-session UUID for audit correlation. */
  sessionId: string
  /** Standard JWT claims. */
  iss: string
  iat: number
  exp: number
  role: 'preview'
}

// ── Mint ─────────────────────────────────────────────────────────────────────

/**
 * Mint a preview session JWT.
 *
 * MUST only be called from a server route that has verified:
 *   - caller is authenticated
 *   - caller has is_super_admin = true
 *   - target user exists
 *   - if mode === 'write', caller.email === DIRECTOR_EMAIL
 */
export async function mintPreviewToken(params: {
  targetUserId: string
  originatorId: string
  originatorEmail: string
  mode: PreviewMode
  sessionId: string
}): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET is required for preview session tokens')
  }

  return new SignJWT({
    sub: params.targetUserId,
    originator: params.originatorId,
    originator_email: params.originatorEmail,
    mode: params.mode,
    sessionId: params.sessionId,
    role: 'preview',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(PREVIEW_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${PREVIEW_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret))
}

// ── Verify ───────────────────────────────────────────────────────────────────

/**
 * Verify a preview token. Returns claims on success, null on any failure.
 * Never throws — callers should treat null as "no valid preview session".
 */
export async function verifyPreviewToken(token: string): Promise<PreviewClaims | null> {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) return null

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: PREVIEW_ISSUER,
      algorithms: ['HS256'],
    })

    if (payload.role !== 'preview') return null
    if (!payload.sub || !payload.originator || !payload.sessionId) return null
    if (payload.mode !== 'read' && payload.mode !== 'write') return null

    return payload as unknown as PreviewClaims
  } catch {
    return null
  }
}

/**
 * Read and verify the preview token from the cookie jar.
 * Returns null if no cookie or invalid/expired token.
 */
export async function getPreviewClaimsFromCookies(): Promise<PreviewClaims | null> {
  const jar = await cookies()
  const token = jar.get(PREVIEW_COOKIE_NAME)?.value
  if (!token) return null
  return verifyPreviewToken(token)
}

// ── Audit (service-role client, so writes bypass RLS) ────────────────────────

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )
}

/**
 * Record a preview session event in role_audit_log.
 * Silent on failure — audit must never break the user-facing flow, but errors
 * are console.error'd so they're visible in Vercel logs.
 */
export async function writePreviewAudit(params: {
  actionType: 'preview_session_started' | 'preview_session_ended' | 'preview_mutation_blocked'
  actorUserId: string
  actorName: string
  targetUserId: string
  mode: PreviewMode
  sessionId: string
  description: string
  extra?: Record<string, unknown>
}): Promise<void> {
  try {
    const sb = getServiceRoleClient()
    await sb.from('role_audit_log').insert({
      action_type: params.actionType,
      actor_user_id: params.actorUserId,
      actor_name: params.actorName,
      target_user_id: params.targetUserId,
      new_value: {
        mode: params.mode,
        sessionId: params.sessionId,
        ...(params.extra ?? {}),
      },
      description: params.description,
    })
  } catch (err) {
    console.error('[preview-session] audit write failed:', err)
  }
}

// ── Authorization helpers ────────────────────────────────────────────────────

/**
 * Returns the mode a given super admin is allowed to use.
 * Non-super-admins MUST NOT call this — check is_super_admin first.
 */
export function allowedPreviewModeFor(email: string | null | undefined): PreviewMode {
  if (!email) return 'read'
  return email.toLowerCase() === DIRECTOR_EMAIL.toLowerCase() ? 'write' : 'read'
}

export function canUseWriteMode(email: string | null | undefined): boolean {
  return allowedPreviewModeFor(email) === 'write'
}
