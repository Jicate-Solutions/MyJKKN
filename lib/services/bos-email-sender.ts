/**
 * BoS Email Sender — direct SMTP delivery via nodemailer.
 *
 * Unlike the older `email-service.ts` which queues into `email_notifications`,
 * this helper sends synchronously through the institution's saved SMTP row.
 * Used by the Members-tab notify-members endpoint so chairmen clicking
 * "Send Invitation Emails" actually delivers to inboxes, not just queues.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BosSmtpConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password_encrypted: string; // historical column name; stored as-is
  sender_email: string;
  sender_name: string;
  default_cc_emails: string[] | null;
}

export interface SendEmailAttachment {
  filename: string;
  /** Buffer of the file contents. Most callers pass jsPDF.output('arraybuffer') wrapped. */
  content: Buffer;
  contentType?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback for clients that don't render HTML. */
  text?: string;
  /** Extra CCs beyond the SMTP config's default_cc_emails. */
  cc?: string[];
  /** Optional file attachments (PDF, etc.). */
  attachments?: SendEmailAttachment[];
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

// ── SMTP config resolver ──────────────────────────────────────────────────────

/**
 * Load the active SMTP row for a given institutions_id. Returns null if no
 * row exists (caller decides whether that's an error or a no-op).
 */
export async function resolveBosSmtpConfig(
  supabase: SupabaseClient,
  institutionsId: string,
): Promise<BosSmtpConfig | null> {
  // Translate institutions_id → counselling_code (the natural key on
  // smtp_configuration). CAS pairs share one row by design.
  const { data: inst } = await supabase
    .from('institutions')
    .select('counselling_code')
    .eq('id', institutionsId)
    .maybeSingle();

  const counsellingCode = (inst as { counselling_code?: string | null } | null)?.counselling_code;
  if (!counsellingCode) return null;

  const { data, error } = await supabase
    .from('smtp_configuration')
    .select(
      'smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_encrypted, sender_email, sender_name, default_cc_emails',
    )
    .eq('institution_code', counsellingCode)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[bos-email-sender] resolveBosSmtpConfig error:', error);
    return null;
  }
  return (data as BosSmtpConfig) ?? null;
}

// ── Transporter cache ─────────────────────────────────────────────────────────
// nodemailer's createTransport spins up a connection pool. Caching by
// (host:port:user) so repeated sends in the same request lifecycle reuse the
// same pool. Keys are local to the process, so they don't survive cold starts
// — that's fine; each invocation rebuilds and drops the pool.

const transporterCache = new Map<string, Transporter>();

function getTransporter(cfg: BosSmtpConfig): Transporter {
  const key = `${cfg.smtp_host}:${cfg.smtp_port}:${cfg.smtp_user}`;
  let t = transporterCache.get(key);
  if (!t) {
    t = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: cfg.smtp_port,
      // Per nodemailer: `secure: true` means SSL on connection (typically port 465);
      // `secure: false` + STARTTLS upgrade on submission (typically port 587).
      // We map the UI toggle to the SSL semantics; for 587/STARTTLS, set the
      // form toggle off — most providers accept that.
      secure: cfg.smtp_secure && cfg.smtp_port === 465,
      auth: {
        user: cfg.smtp_user,
        pass: cfg.smtp_password_encrypted,
      },
      // Keep STARTTLS available for 587 even when secure=false.
      requireTLS: cfg.smtp_port === 587,
    });
    transporterCache.set(key, t);
  }
  return t;
}

// ── Send ──────────────────────────────────────────────────────────────────────

/**
 * Send a single email. Returns ok=true with messageId on success, or
 * ok=false with the error string on failure. Never throws.
 */
export async function sendBosEmail(
  cfg: BosSmtpConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  try {
    const transporter = getTransporter(cfg);
    const cc = [
      ...(cfg.default_cc_emails ?? []),
      ...(input.cc ?? []),
    ].filter(Boolean);

    const info = await transporter.sendMail({
      from: cfg.sender_name
        ? `"${cfg.sender_name}" <${cfg.sender_email}>`
        : cfg.sender_email,
      to: input.to,
      cc: cc.length > 0 ? cc : undefined,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType ?? 'application/pdf',
      })),
    });

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error('[bos-email-sender] sendMail error:', { to: input.to, message });
    return { ok: false, error: message };
  }
}
