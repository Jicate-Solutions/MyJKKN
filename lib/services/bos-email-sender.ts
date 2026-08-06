/**
 * BoS Email Sender — direct SMTP delivery via nodemailer.
 *
 * Unlike the older `email-service.ts` which queues into `email_notifications`,
 * this helper sends synchronously through the institution's saved SMTP row.
 * Used by the Members-tab notify-members endpoint so chairmen clicking
 * "Send Invitation Emails" actually delivers to inboxes, not just queues.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { createHash } from 'node:crypto';
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
  // Optional Academic-Council-only From override. Same SMTP account; only the
  // visible From: identity differs. NULL = fall back to sender_email/name.
  ac_sender_email: string | null;
  ac_sender_name: string | null;
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
  /**
   * Optional From: override. When set, replaces the config's sender_email /
   * sender_name for THIS send only (same SMTP account/credentials). Used for
   * Academic Council notices, which send from a different identity than BoS.
   */
  fromEmail?: string | null;
  fromName?: string | null;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Visible From: display name for a BoS-family send, keyed by meeting_type.
 *
 *   • BoS meetings        → smtpConfig.sender_name as configured
 *     (e.g. "BOS - JKKN College of Arts & Science (Autonomous)")
 *   • Governing Body      → rewrite leading "BOS" / "BoS" / "Board of Studies"
 *     to "Governing Body" (e.g. "Governing Body - JKKN College…")
 *   • Academic Council    → ac_sender_name when configured, otherwise the
 *     same rewrite with "Academic Council"
 */
export function resolveBosSenderDisplayName(
  meetingType: string | null | undefined,
  cfg: Pick<BosSmtpConfig, 'sender_name' | 'ac_sender_name'>,
): string {
  if (meetingType === 'academic_council' && cfg.ac_sender_name?.trim()) {
    return cfg.ac_sender_name.trim();
  }

  const label =
    meetingType === 'governing_body'
      ? 'Governing Body'
      : meetingType === 'academic_council'
        ? 'Academic Council'
        : null;

  if (!label) return cfg.sender_name;

  const rewritten = cfg.sender_name.replace(
    /^(BOS|BoS|Board of Studies)\s*[-–—]\s*/i,
    `${label} - `,
  );
  return rewritten !== cfg.sender_name ? rewritten : `${label} - ${cfg.sender_name}`;
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
      'smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_encrypted, sender_email, sender_name, default_cc_emails, ac_sender_email, ac_sender_name',
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

// ── Board-level sender override ────────────────────────────────────────────────

export interface BosBoardSender {
  sender_email: string;
  sender_name: string | null;
  // ── Model 3: optional per-board SMTP account (20260725) ────────────────────
  // When smtp_user + smtp_password_encrypted are set, the board authenticates
  // as its own mailbox. host/port/secure are optional overrides (NULL inherits
  // the institution config).
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  smtp_user?: string | null;
  smtp_password_encrypted?: string | null;
}

/**
 * Resolve a per-board sender override for (institutionsId, boardId). ECE and
 * EEE can each send from their own address — either as a From-only override on
 * the shared institution account (Models 1/2), or, when smtp_user/password are
 * set, by authenticating as their own mailbox (Model 3). Returns null when no
 * active override exists → caller falls back to the institution default
 * (and, for Academic Council, its ac_sender_email).
 *
 * Never throws; a lookup failure degrades to null (institution default).
 */
export async function resolveBosBoardSender(
  supabase: SupabaseClient,
  institutionsId: string,
  boardId: string | null | undefined,
): Promise<BosBoardSender | null> {
  if (!boardId) return null;

  const { data, error } = await supabase
    .from('bos_board_senders')
    .select(
      'sender_email, sender_name, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_encrypted',
    )
    .eq('institutions_id', institutionsId)
    .eq('board_id', boardId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.warn('[bos-email-sender] resolveBosBoardSender error:', error);
    return null;
  }
  const row = data as BosBoardSender | null;
  if (!row?.sender_email?.trim()) return null;
  return row;
}

/**
 * Build the effective SMTP config for a send, given the institution config and
 * an optional per-board sender.
 *
 *   • Board has its own smtp_user + password → Model 3: authenticate AS the
 *     board mailbox. host/port/secure override the institution's when set,
 *     otherwise inherit. `usesBoardAuth` = true.
 *   • Board has no credentials (or no board) → Model 1/2: return the
 *     institution config unchanged; the caller applies the From-only override
 *     via sendBosEmail's fromEmail/fromName. `usesBoardAuth` = false.
 *
 * The transporter cache keys on host:port:user, so each board account that
 * authenticates as itself naturally gets its own connection pool.
 */
export function mergeBoardSmtpConfig(
  base: BosSmtpConfig,
  board: BosBoardSender | null,
): { cfg: BosSmtpConfig; usesBoardAuth: boolean } {
  const user = board?.smtp_user?.trim();
  const pass = board?.smtp_password_encrypted?.trim();
  if (!board || !user || !pass) {
    return { cfg: base, usesBoardAuth: false };
  }
  return {
    usesBoardAuth: true,
    cfg: {
      ...base,
      smtp_host: board.smtp_host?.trim() || base.smtp_host,
      smtp_port: board.smtp_port ?? base.smtp_port,
      smtp_secure: board.smtp_secure ?? base.smtp_secure,
      smtp_user: user,
      smtp_password_encrypted: pass,
    },
  };
}

// ── Transporter cache ─────────────────────────────────────────────────────────
// nodemailer's createTransport spins up a connection pool. Caching by
// (host:port:user:password-fingerprint) so repeated sends in the same request
// lifecycle reuse the same pool. Keys are local to the process, so they don't
// survive cold starts — that's fine; each invocation rebuilds and drops the pool.
//
// The password fingerprint is part of the key on purpose. nodemailer bakes the
// `auth` credentials into the transporter at createTransport time, so a key of
// only (host:port:user) would pin the FIRST password this process ever saw for
// that mailbox. An admin who fixes a wrong password at /bos/email-settings would
// keep getting `535-5.7.8 Username and Password not accepted` from the cached
// transporter until the server restarted — the DB row correct, every send still
// failing. Fingerprinting the secret makes a credential change mint a new
// transporter immediately.

const transporterCache = new Map<string, Transporter>();

/** Short, non-reversible fingerprint of a secret — safe to embed in a cache key. */
function secretFingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

function getTransporter(cfg: BosSmtpConfig): Transporter {
  const account = `${cfg.smtp_host}:${cfg.smtp_port}:${cfg.smtp_user}`;
  const key = `${account}:${secretFingerprint(cfg.smtp_password_encrypted ?? '')}`;
  let t = transporterCache.get(key);
  if (!t) {
    // Credentials for this mailbox changed — drop the transporter built on the
    // old secret so we don't leak its (unpooled but still open-able) handle.
    for (const staleKey of transporterCache.keys()) {
      if (staleKey !== key && staleKey.startsWith(`${account}:`)) {
        transporterCache.get(staleKey)?.close?.();
        transporterCache.delete(staleKey);
      }
    }
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

    // Resolve the From: identity. A per-send override (input.fromEmail) wins —
    // that's how Academic Council notices go out from a different address than
    // BoS while reusing the same authenticated SMTP account. Empty/null falls
    // back to the config's default sender.
    const fromEmail = input.fromEmail?.trim() || cfg.sender_email;
    const fromName = (input.fromName ?? cfg.sender_name)?.trim() || '';

    const info = await transporter.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
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
