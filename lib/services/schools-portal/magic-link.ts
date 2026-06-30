/**
 * Schools Network HM Portal — magic-link mint + verify + send.
 *
 * Why a bespoke magic-link service (not a reuse of consultant-portal-access-service)
 * ----------------------------------------------------------------------------
 * The consultant-portal-access-service (lib/services/admission/consultant-portal-access-service.ts)
 * gates portal entry for users WHO ARE ALREADY in auth.users. The HM portal's
 * users (school_contacts) are NOT auth.users members and never get a Supabase
 * session. So we need a parallel mechanism: token-based external auth that
 * carries the school_id at issue time and re-verifies at consume time.
 *
 * The closest in-repo parallel is the parent-portal JWT flow
 * (lib/auth/parent-jwt.ts + app/api/parent/auth/login). We mirror that pattern
 * (jose HS256 + HttpOnly cookie + service-role DB writes) for HMs.
 *
 * Resend is the canonical mail transport — we import `resend` from
 * '@/lib/resend' (the singleton other email services use) rather than
 * instantiating a new client.
 *
 * Token shape
 * -----------
 *   - Raw token = 32 random bytes, base64url-encoded.
 *   - DB stores SHA-256(token) (so the raw token is never readable from DB).
 *   - Single-use: row's `consumed_at` is set on first verify; subsequent
 *     verify calls return null.
 *   - TTL: 15 min (default; tunable via SCHOOL_PORTAL_MAGIC_LINK_TTL_MIN env).
 */

import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { resend } from '@/lib/resend';
import { logger } from '@/lib/utils/enhanced-logger';

// --- Config ---------------------------------------------------------------

const DEFAULT_TTL_MIN = 15;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

function ttlMinutes(): number {
  const raw = process.env.SCHOOL_PORTAL_MAGIC_LINK_TTL_MIN;
  if (!raw) return DEFAULT_TTL_MIN;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 60 ? n : DEFAULT_TTL_MIN;
}

function baseUrl(): string {
  // NEXT_PUBLIC_APP_URL is the canonical public URL constant elsewhere in the
  // codebase; fall back to a localhost dev value so this works in local builds.
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  );
}

// --- Internals ------------------------------------------------------------

function generateRawToken(): string {
  // 32 random bytes -> 43-char base64url (no padding).
  return randomBytes(32).toString('base64url');
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// --- Types ----------------------------------------------------------------

export interface RequestLinkInput {
  email: string;
  userAgent?: string | null;
  ip?: string | null;
}

export type RequestLinkResult =
  | { ok: true; sent: true; debugLink?: string }
  | { ok: true; sent: false; reason: 'unknown_contact' | 'no_portal_role' }
  | { ok: false; error: string };

export interface VerifiedLink {
  contactId: string;
  schoolId: string;
  email: string; // lowercased
  role: string; // school_contact_roles.code
  schoolName: string | null;
}

// --- Public API -----------------------------------------------------------

/**
 * Look up `school_contacts` by lowercased email + an active portal-eligible
 * role (`school_contact_roles.can_login_to_portal = TRUE`). If a match is
 * found, mint a single-use token, store its hash, and send a Resend email
 * carrying the raw token in the verify URL.
 *
 * To avoid email-enumeration, we return `sent: false` for unknown contacts
 * with a generic reason — the API route should ALWAYS respond with the same
 * shape regardless (do not leak existence/absence to the client).
 *
 * In non-production, when RESEND_API_KEY is absent we skip the email send and
 * return the link in `debugLink` so local devs can complete the flow.
 */
export async function requestMagicLink(
  input: RequestLinkInput,
): Promise<RequestLinkResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Invalid email' };
  }

  const db = createServiceRoleClient();

  // Resolve contact -> school + portal-eligible role.
  //
  // We deliberately keep this read narrow (no joining service-role-readable
  // school summary here) so the link issue path stays fast and the consume
  // path is the canonical re-verifier.
  const { data: contactRow, error: lookupError } = await db
    .from('school_contacts')
    .select(
      `
        id,
        school_id,
        email,
        role:school_contact_roles!inner(code, can_login_to_portal)
      `,
    )
    .ilike('email', email)
    .maybeSingle();

  if (lookupError) {
    // Tables not yet created (Agent A's migration not applied) OR a real DB
    // error. Log + return generic ok-but-unsent so the UI doesn't reveal
    // schema state to the client.
    logger.warn('schools-portal/magic-link', 'lookup failed', {
      email,
      code: lookupError.code,
      message: lookupError.message,
    });
    return { ok: true, sent: false, reason: 'unknown_contact' };
  }

  if (!contactRow) {
    return { ok: true, sent: false, reason: 'unknown_contact' };
  }

  // Supabase typings see the joined !inner row as either a single object
  // or an array of one; tolerate both.
  const roleJoin = Array.isArray(contactRow.role)
    ? contactRow.role[0]
    : contactRow.role;
  if (!roleJoin?.can_login_to_portal) {
    return { ok: true, sent: false, reason: 'no_portal_role' };
  }

  // Mint the token
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMinutes() * 60_000).toISOString();

  const { error: insertError } = await db
    .from('school_portal_magic_links')
    .insert({
      email,
      school_id: contactRow.school_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      issued_ua: input.userAgent ?? null,
      issued_ip: input.ip ?? null,
    });

  if (insertError) {
    logger.error('schools-portal/magic-link', 'token insert failed', {
      code: insertError.code,
      message: insertError.message,
    });
    return { ok: false, error: 'Could not issue link' };
  }

  const verifyUrl = `${baseUrl()}/schools-portal/verify?token=${encodeURIComponent(rawToken)}`;

  // Send via Resend (canonical wrapper).
  // Fallback for local dev: when no API key, return the link in `debugLink`
  // so the developer can paste it. NEVER do this in production.
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        'schools-portal/magic-link',
        'RESEND_API_KEY missing in production — magic link not sent',
        { email },
      );
      return { ok: false, error: 'Email provider not configured' };
    }
    logger.dev('schools-portal/magic-link', 'dev-mode link (no Resend)', {
      email,
      verifyUrl,
    });
    return { ok: true, sent: true, debugLink: verifyUrl };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Sign in to your school portal — JKKN',
      html: renderMagicLinkHtml({ verifyUrl, ttlMinutes: ttlMinutes() }),
      text: renderMagicLinkText({ verifyUrl, ttlMinutes: ttlMinutes() }),
    });
    if (error) {
      logger.error('schools-portal/magic-link', 'Resend send failed', {
        email,
        error: (error as { message?: string }).message ?? String(error),
      });
      return { ok: false, error: 'Could not send email' };
    }
    logger.info('schools-portal/magic-link', 'magic link sent', {
      email,
      resendId: data?.id,
    });
    return { ok: true, sent: true };
  } catch (err) {
    logger.error('schools-portal/magic-link', 'Resend threw', {
      email,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'Could not send email' };
  }
}

/**
 * Single-use, atomic verify. Looks up the token by hash, refuses if expired
 * or already consumed, marks consumed_at on success, and returns the
 * resolved contact + school metadata for the API route to mint a session.
 */
export async function verifyMagicLink(
  rawToken: string,
): Promise<VerifiedLink | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashToken(rawToken);

  const db = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  // Atomic consume: UPDATE … WHERE consumed_at IS NULL AND expires_at > now()
  // RETURNING. If 0 rows, the link is invalid (unknown, expired, or replayed).
  // PostgREST exposes this via .update().select() — the row only comes back
  // when the WHERE clause matched, which gives us atomic single-use semantics
  // even under concurrent verify attempts.
  const { data: consumed, error: updateError } = await db
    .from('school_portal_magic_links')
    .update({ consumed_at: nowIso })
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('id, email, school_id')
    .maybeSingle();

  if (updateError) {
    logger.warn('schools-portal/magic-link', 'consume update failed', {
      code: updateError.code,
      message: updateError.message,
    });
    return null;
  }

  if (!consumed) return null;

  // Re-resolve the contact and role at consume time — between issue and consume,
  // the contact might have been deactivated, role flipped, etc. This is the
  // canonical source of truth for portal access (not the stored row alone).
  const { data: contactRow, error: contactError } = await db
    .from('school_contacts')
    .select(
      `
        id,
        school_id,
        email,
        role:school_contact_roles!inner(code, can_login_to_portal),
        school:schools!inner(id, name)
      `,
    )
    .ilike('email', consumed.email)
    .eq('school_id', consumed.school_id)
    .maybeSingle();

  if (contactError || !contactRow) {
    logger.warn('schools-portal/magic-link', 'consume re-resolve failed', {
      email: consumed.email,
      code: contactError?.code,
      message: contactError?.message,
    });
    return null;
  }

  const roleJoin = Array.isArray(contactRow.role)
    ? contactRow.role[0]
    : contactRow.role;
  const schoolJoin = Array.isArray(contactRow.school)
    ? contactRow.school[0]
    : contactRow.school;

  if (!roleJoin?.can_login_to_portal) return null;

  return {
    contactId: contactRow.id,
    schoolId: contactRow.school_id,
    email: (contactRow.email ?? consumed.email).toLowerCase(),
    role: roleJoin.code,
    schoolName: schoolJoin?.name ?? null,
  };
}

// --- Email templates ------------------------------------------------------

function renderMagicLinkHtml(args: {
  verifyUrl: string;
  ttlMinutes: number;
}): string {
  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f6f8fa;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#11243a;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #f1f5f9;">
              <h1 style="margin:0;font-size:18px;color:#0b6d41;">JKKN Schools Network</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 12px;font-size:15px;">Hello,</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
                Click the button below to sign in to your school's portal. This link is valid for the next ${args.ttlMinutes} minutes and can be used only once.
              </p>
              <p style="margin:24px 0;">
                <a href="${args.verifyUrl}" style="display:inline-block;background:#0b6d41;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">
                  Sign in to your portal
                </a>
              </p>
              <p style="margin:24px 0 0;font-size:12px;color:#6b7280;line-height:1.6;word-break:break-all;">
                If the button doesn't work, paste this URL into your browser:<br/>
                ${args.verifyUrl}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #f1f5f9;background:#fafafa;border-radius:0 0 12px 12px;">
              <p style="margin:0;font-size:12px;color:#6b7280;">
                If you didn't request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function renderMagicLinkText(args: {
  verifyUrl: string;
  ttlMinutes: number;
}): string {
  return [
    'JKKN Schools Network',
    '',
    `Sign in to your school's portal. This link is valid for ${args.ttlMinutes} minutes and can be used only once:`,
    args.verifyUrl,
    '',
    "If you didn't request this email, ignore it.",
  ].join('\n');
}
