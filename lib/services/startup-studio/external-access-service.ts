/**
 * SF100 external mentor/investor — access-code service.
 *
 * Account-less code login for external contacts (no JKKN account). Mirrors the
 * parent-portal OTP credential shape (lib/services/auth/parent-otp-service.ts):
 * the raw 6-digit code is NEVER stored — only an HMAC-SHA256 hash keyed by a
 * server-side pepper and bound to the mentor id (so a hash captured for one
 * contact cannot be replayed against another). Wrong tries increment an attempt
 * counter; after `max_attempts` the credential is locked for LOCKOUT_MINUTES.
 *
 * Unlike the parent OTP (single-use, 5-min TTL), this code is a PERMANENT
 * credential — valid until a coordinator flips is_active=false. The lockout is
 * the safety net that makes a static code acceptable (spec §4).
 *
 * Node runtime only (service-role client + node:crypto).
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/** HMAC pepper — same resolution order as the session secret. */
function pepper(): string {
  return (
    process.env.SF100_EXTERNAL_JWT_SECRET ||
    process.env.PARENT_JWT_SECRET ||
    'sf100-external-fallback-pepper'
  );
}

/** Bind the mentor id into the message so a hash is not portable across contacts. */
function hashCode(mentorId: string, code: string): string {
  return createHmac('sha256', pepper()).update(`${mentorId}:${code}`).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface GenerateCodeResult {
  ok: true;
  /** The raw 6-digit code — returned ONCE, at generation time only, never stored. */
  code: string;
}

/**
 * Generate (or regenerate) a 6-digit access code for an EXTERNAL mentor/investor.
 * Resets the attempt counter and any lockout, and (re)activates the credential.
 * Caller MUST be authorized (coordinator/admin) — enforced in the API route.
 */
export async function generateAccessCode(
  mentorId: string,
  createdBy: string
): Promise<GenerateCodeResult | { ok: false; reason: 'not_found' | 'not_external' }> {
  const db = createServiceRoleClient();

  const { data: mentor } = await db
    .from('ss_mentors')
    .select('id, user_id')
    .eq('id', mentorId)
    .maybeSingle();

  if (!mentor) return { ok: false, reason: 'not_found' };
  // Only account-less (external/investor) contacts use a code. An internal mentor
  // is linked to a Supabase profile (user_id) and logs in via staff SSO.
  if (mentor.user_id) return { ok: false, reason: 'not_external' };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const code_hash = hashCode(mentorId, code);
  const nowIso = new Date().toISOString();

  await db
    .from('ss_external_access')
    .upsert(
      {
        mentor_id: mentorId,
        code_hash,
        is_active: true,
        attempts: 0,
        max_attempts: MAX_ATTEMPTS,
        locked_until: null,
        deactivated_by: null,
        deactivated_at: null,
        created_by: createdBy,
        updated_at: nowIso,
      },
      { onConflict: 'mentor_id' }
    );

  return { ok: true, code };
}

/**
 * Deactivate an external contact's access code (coordinator revoke). Permanent
 * until a new code is generated. Caller MUST be authorized (enforced in route).
 */
export async function deactivateAccessCode(
  mentorId: string,
  deactivatedBy: string
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('ss_external_access')
    .update({
      is_active: false,
      deactivated_by: deactivatedBy,
      deactivated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('mentor_id', mentorId)
    .select('id')
    .maybeSingle();
  if (error || !data) return { ok: false, reason: 'not_found' };
  return { ok: true };
}

export type VerifyCodeResult =
  | { ok: true; mentorId: string }
  | { ok: false; reason: 'invalid' | 'locked'; lockedUntil?: string };

/**
 * Verify an (identifier, code) pair. `identifier` is the external contact's email
 * or phone. Resolves to the ss_mentors row (user_id IS NULL = external), then
 * checks the ss_external_access credential with lockout.
 *
 * Failures are deliberately generic ('invalid') — never reveal whether the
 * email/phone exists, whether the code was wrong, or whether the credential was
 * deactivated (no account enumeration). 'locked' is surfaced (with unlock time)
 * because a locked user needs to know to wait.
 */
export async function verifyAccessCode(
  identifier: string,
  code: string
): Promise<VerifyCodeResult> {
  const id = (identifier ?? '').trim();
  if (!id || !/^\d{6}$/.test((code ?? '').trim())) {
    return { ok: false, reason: 'invalid' };
  }
  const db = createServiceRoleClient();

  // Resolve candidate external contacts by email (case-insensitive) or phone
  // (trailing-10 digits). Phase-1 scale is tiny; an index-backed .or() is fine.
  const emailLc = id.toLowerCase();
  const phoneDigits = id.replace(/\D/g, '');
  const phoneTail = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;

  const orParts = [`email.ilike.${emailLc}`];
  if (phoneTail.length >= 6) orParts.push(`phone.ilike.%${phoneTail}`);

  const { data: mentors } = await db
    .from('ss_mentors')
    .select('id, email, phone, user_id')
    .is('user_id', null)
    .or(orParts.join(','))
    .limit(10);

  const candidates = (mentors ?? []) as Array<{ id: string }>;
  if (candidates.length === 0) return { ok: false, reason: 'invalid' };

  const nowMs = Date.now();

  for (const m of candidates) {
    const { data: access } = await db
      .from('ss_external_access')
      .select('id, code_hash, is_active, attempts, max_attempts, locked_until')
      .eq('mentor_id', m.id)
      .maybeSingle();

    if (!access || !access.is_active) continue;

    // Currently locked → reject without touching the code (constant-time on lock).
    if (access.locked_until && new Date(access.locked_until).getTime() > nowMs) {
      return { ok: false, reason: 'locked', lockedUntil: access.locked_until };
    }

    // Lock has expired → clear the counter before this fresh attempt.
    let attempts = access.attempts ?? 0;
    if (access.locked_until && new Date(access.locked_until).getTime() <= nowMs) {
      attempts = 0;
    }

    const matches = safeEqualHex(hashCode(m.id, code.trim()), access.code_hash);

    if (matches) {
      await db
        .from('ss_external_access')
        .update({
          attempts: 0,
          locked_until: null,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', access.id);
      return { ok: true, mentorId: m.id };
    }

    // Wrong code → count it; lock when the budget is exhausted.
    const nextAttempts = attempts + 1;
    const max = access.max_attempts ?? MAX_ATTEMPTS;
    const lockNow = nextAttempts >= max;
    const lockedUntil = lockNow
      ? new Date(nowMs + LOCKOUT_MINUTES * 60 * 1000).toISOString()
      : null;
    await db
      .from('ss_external_access')
      .update({
        attempts: nextAttempts,
        locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      })
      .eq('id', access.id);

    return lockNow
      ? { ok: false, reason: 'locked', lockedUntil: lockedUntil! }
      : { ok: false, reason: 'invalid' };
  }

  return { ok: false, reason: 'invalid' };
}

export interface AccessStatus {
  hasCode: boolean;
  isActive: boolean;
  locked: boolean;
  lockedUntil: string | null;
  attempts: number;
  lastLoginAt: string | null;
}

/** Status for the coordinator registry UI (never returns the code or its hash). */
export async function getAccessStatus(mentorId: string): Promise<AccessStatus> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('ss_external_access')
    .select('is_active, attempts, locked_until, last_login_at')
    .eq('mentor_id', mentorId)
    .maybeSingle();

  if (!data) {
    return {
      hasCode: false,
      isActive: false,
      locked: false,
      lockedUntil: null,
      attempts: 0,
      lastLoginAt: null,
    };
  }
  const locked =
    !!data.locked_until && new Date(data.locked_until).getTime() > Date.now();
  return {
    hasCode: true,
    isActive: !!data.is_active,
    locked,
    lockedUntil: data.locked_until ?? null,
    attempts: data.attempts ?? 0,
    lastLoginAt: data.last_login_at ?? null,
  };
}
