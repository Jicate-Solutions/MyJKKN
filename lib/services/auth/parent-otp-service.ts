/**
 * Parent Portal — OTP service.
 *
 * Phase A1 ships a DEV STUB channel (per the implementation decision): the OTP
 * is generated, hashed, and stored normally, but "delivery" is a server-side log
 * and — only outside production — the code is returned to the caller so the full
 * register/login/reset flow is testable without a live WhatsApp/SMS vendor.
 *
 * To go live later, implement `deliverOtp()` against meta-whatsapp-integration
 * (primary) → SMS gateway (fallback); nothing else in the flow changes.
 *
 * Node runtime only (service-role client + node:crypto).
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  isWhatsAppConfigured,
  sendTemplateMessage,
  type WATemplateComponent,
} from '@/lib/services/whatsapp/whatsapp-api-client';

export type OtpPurpose = 'register' | 'login' | 'reset' | 'add_sibling';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const isProd = process.env.NODE_ENV === 'production';

function hashOtp(mobile: string, code: string): string {
  // HMAC keyed by the JWT secret (acts as a server-side pepper). Binding the
  // mobile into the message prevents a hash captured for one number being
  // replayed against another.
  const key = process.env.PARENT_JWT_SECRET || 'parent-otp-fallback-pepper';
  return createHmac('sha256', key).update(`${mobile}:${code}`).digest('hex');
}

/**
 * Deliver the OTP. WhatsApp (primary) → SMS (fallback) → dev stub.
 *
 * WhatsApp activates only when an approved template name is configured
 * (PARENT_OTP_WA_TEMPLATE) AND the Meta Cloud API is configured. The default
 * payload matches a Meta "authentication" template (body param + copy-code
 * button); set PARENT_OTP_WA_NO_BUTTON=true for a body-only utility template.
 * Any send failure falls through so OTP issuance never blocks registration.
 */
async function deliverOtp(
  mobile: string,
  code: string,
  purpose: OtpPurpose
): Promise<'whatsapp' | 'sms'> {
  // ── WhatsApp (primary) ──────────────────────────────────────────────
  const template = process.env.PARENT_OTP_WA_TEMPLATE;
  if (template && isWhatsAppConfigured()) {
    try {
      const cc = process.env.PARENT_OTP_COUNTRY_CODE || '91';
      const to = `${cc}${mobile}`; // mobile is the normalized trailing-10 digits
      const lang = process.env.PARENT_OTP_WA_LANG || 'en';
      const components: WATemplateComponent[] = [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
      ];
      if (process.env.PARENT_OTP_WA_NO_BUTTON !== 'true') {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: 0,
          parameters: [{ type: 'text', text: code }],
        });
      }
      await sendTemplateMessage(to, template, lang, components);
      return 'whatsapp';
    } catch (err) {
      console.warn(
        `[parent-otp] WhatsApp send failed for ${mobile} [${purpose}], falling back:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // ── SMS (fallback) ──────────────────────────────────────────────────
  // TODO(phase-live): call the licensed SMS gateway once SMS_GATEWAY_API_KEY is
  // provisioned (DLT template + SMS_SENDER_ID). Until then this is a dev stub.

  // ── Dev stub ────────────────────────────────────────────────────────
  console.info(`[parent-otp] (dev stub) OTP for ${mobile} [${purpose}] = ${code}`);
  return 'sms';
}

export interface SendOtpResult {
  ok: true;
  /** Present ONLY in non-production, to make the flow testable end-to-end. */
  devCode?: string;
}

/**
 * Generate, store, and "send" a fresh OTP for (mobile, purpose).
 * Any earlier unconsumed OTPs for the same (mobile, purpose) are invalidated
 * so only the newest code is ever valid.
 */
export async function sendOtp(
  mobile: string,
  purpose: OtpPurpose
): Promise<SendOtpResult> {
  const db = createServiceRoleClient();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const otp_hash = hashOtp(mobile, code);
  const now = Date.now();

  // Invalidate prior outstanding codes for this purpose.
  await db
    .from('pp_otp_verifications')
    .update({ consumed_at: new Date(now).toISOString() })
    .eq('mobile', mobile)
    .eq('purpose', purpose)
    .is('consumed_at', null);

  const channel = await deliverOtp(mobile, code, purpose);

  await db.from('pp_otp_verifications').insert({
    mobile,
    otp_hash,
    purpose,
    channel,
    expires_at: new Date(now + OTP_TTL_MS).toISOString(),
  });

  return { ok: true, ...(isProd ? {} : { devCode: code }) };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'mismatch' };

/**
 * Verify a code against the newest outstanding OTP for (mobile, purpose).
 * On success the row is consumed (single-use). Wrong codes count against a
 * per-OTP attempt budget.
 */
export async function verifyOtp(
  mobile: string,
  purpose: OtpPurpose,
  code: string
): Promise<VerifyOtpResult> {
  const db = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: row } = await db
    .from('pp_otp_verifications')
    .select('id, otp_hash, attempts, expires_at, consumed_at')
    .eq('mobile', mobile)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { ok: false, reason: 'not_found' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  const candidate = Buffer.from(hashOtp(mobile, code), 'hex');
  const expected = Buffer.from(row.otp_hash, 'hex');
  const matches =
    candidate.length === expected.length && timingSafeEqual(candidate, expected);

  if (!matches) {
    await db
      .from('pp_otp_verifications')
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq('id', row.id);
    return { ok: false, reason: 'mismatch' };
  }

  await db
    .from('pp_otp_verifications')
    .update({ consumed_at: nowIso })
    .eq('id', row.id);
  return { ok: true };
}
