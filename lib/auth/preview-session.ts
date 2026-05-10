// lib/auth/preview-session.ts
// ============================================================================
// "See As User" preview session — JWT mint/verify + audit helpers.
// ============================================================================
//
// Security model (v1 — super-admin-only):
//
// 1. Only users with `is_super_admin = true` can START a preview session.
// 2. Token is a signed JWT (HS256, signed with PREVIEW_SIGNING_SECRET — see
//    getSigningSecret() below) with:
//      - sub: the TARGET user's id     (who we're previewing as)
//      - originator: the INITIATING super admin's id
//      - mode: 'read' | 'write'        (write is director@jkkn.ac.in ONLY)
//      - sessionId: random UUID        (for audit correlation)
//      - iat / exp                     (60-minute hard expiry)
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

/**
 * Emails allowed to use WRITE mode. All other super admins are read-only.
 * - director@jkkn.ac.in — institutional director
 * - boobalan.a@jkkn.ac.in — MyJKKN lead developer (needs write preview for
 *   verifying bug fixes as real target users)
 * DIRECTOR_EMAIL stays exported as the canonical "primary" entry for backwards
 * compat with any other code that imports it.
 */
export const DIRECTOR_EMAIL = 'director@jkkn.ac.in'
export const WRITE_MODE_ALLOWED_EMAILS: readonly string[] = [
  'director@jkkn.ac.in',
  'boobalan.a@jkkn.ac.in',
] as const

/** Cookie name carrying the preview JWT. */
export const PREVIEW_COOKIE_NAME = 'sb-preview-session'

/** Hard maximum preview session lifetime. */
const PREVIEW_TTL_SECONDS = 60 * 60

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

// ── Signing secret resolution ────────────────────────────────────────────────

/**
 * Resolve the HS256 signing secret for preview tokens.
 *
 * Preview tokens are opaque to Supabase — they're minted AND verified by this
 * module only. We don't actually need Supabase's JWT secret; any
 * cryptographically strong secret works. We prefer SUPABASE_JWT_SECRET when
 * available (local dev convention) but fall back to JWT_SECRET (which exists
 * in production Vercel env for other JWT features). This avoids requiring a
 * new env var to be provisioned for this feature.
 *
 * Returns undefined if neither is set, so callers can surface a clear error.
 */
function getSigningSecret(): string | undefined {
  return process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET
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
  const secret = getSigningSecret()
  if (!secret) {
    throw new Error(
      'Preview token signing secret missing — set SUPABASE_JWT_SECRET or JWT_SECRET in env',
    )
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
  const secret = getSigningSecret()
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
  actorEmail?: string | null
  actorRole?: string | null
  targetUserId: string
  targetEmail?: string | null
  mode: PreviewMode
  sessionId: string
  description: string
  extra?: Record<string, unknown>
}): Promise<void> {
  try {
    const sb = getServiceRoleClient()
    // Pull email/role out of `extra` for callers that still pass them the legacy
    // way (target_email / target_role inside extra). Dedicated params win.
    const extra = (params.extra ?? {}) as Record<string, unknown>
    const targetEmail =
      params.targetEmail ??
      (typeof extra.target_email === 'string' ? (extra.target_email as string) : null)
    const targetRoleFromExtra =
      typeof extra.target_role === 'string' ? (extra.target_role as string) : undefined

    const metadata = {
      mode: params.mode,
      sessionId: params.sessionId,
      ...(targetRoleFromExtra ? { target_role: targetRoleFromExtra } : {}),
      ...extra,
    }

    await sb.from('role_audit_log').insert({
      action_type: params.actionType,
      actor_user_id: params.actorUserId,
      actor_name: params.actorName,
      actor_email: params.actorEmail ?? null,
      actor_role: params.actorRole ?? null,
      target_user_id: params.targetUserId,
      target_email: targetEmail,
      metadata,
      // Keep the legacy columns populated too so existing audit UIs that read
      // `new_value` / `description` don't regress.
      new_value: metadata,
      description: params.description,
    })
  } catch (err) {
    console.error('[preview-session] Audit write failed — Non-fatal', err)
  }
}

// ── Authorization helpers ────────────────────────────────────────────────────

/**
 * Returns the mode a given super admin is allowed to use.
 * Non-super-admins MUST NOT call this — check is_super_admin first.
 */
export function allowedPreviewModeFor(email: string | null | undefined): PreviewMode {
  if (!email) return 'read'
  const normalized = email.toLowerCase()
  return WRITE_MODE_ALLOWED_EMAILS.some((e) => e.toLowerCase() === normalized)
    ? 'write'
    : 'read'
}

export function canUseWriteMode(email: string | null | undefined): boolean {
  return allowedPreviewModeFor(email) === 'write'
}
