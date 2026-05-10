export const dynamic = 'force-dynamic';

// /api/cron/hr/document-expiry-reminders
// ----------------------------------------------------------------------------
// T1.5b Phase 2b — daily cron that emails employees + HR officers when a
// verified hr_employee_documents row is approaching its expires_at.
//
// Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.5b Phase 2b)
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
// OR `?secret=` query param (manual runs). Same shape as
// /api/cron/notification-processor + others in this directory.
//
// Schedule: vercel.json — `0 7 * * *` (daily 07:00 UTC = 12:30 IST).
//
// Behavior
// --------
// For each row WHERE verification_status='verified' AND expires_at IS NOT NULL,
// compute days_until_expiry. If it falls in any of the threshold windows
// (30, 14, 7 days), send a reminder email — but only if the corresponding
// `last_reminder_<N>d_at` column is NULL or older than the previous threshold
// (idempotency). After sending, stamp the column.
//
// Recipients per reminder
// -----------------------
// Each reminder goes to (a) the employee whose staff record this row points
// to (via staff.email), AND (b) the HR officer's mailbox configured via the
// HR_OFFICER_EMAIL env var (falls back to DIRECTOR_EMAIL if absent).
//
// Email
// -----
// Inline HTML template — same approach as
// /api/cron/whatsapp-byow-monthly-audit/route.ts. Resend uses
// process.env.RESEND_FROM_EMAIL with onboarding@resend.dev fallback.
//
// Idempotency
// -----------
// We check the `last_reminder_<N>d_at` column BEFORE sending, and write it
// AFTER the email is sent successfully. If a previous run sent the 30-day
// reminder yesterday and today's run still sees the same row at 29 days,
// it skips that threshold (already sent). Manual cron-secret hits will not
// double-email for the same threshold within the same day.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resend } from '@/lib/resend';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const HR_OFFICER_EMAIL =
  process.env.HR_OFFICER_EMAIL ?? process.env.DIRECTOR_EMAIL ?? 'director@jkkn.ac.in';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

// Thresholds in days. Order matters — we check from largest to smallest so
// that a single row can trigger up to one reminder per run (the largest
// threshold it crosses).
const THRESHOLDS = [30, 14, 7] as const;
type ThresholdDays = (typeof THRESHOLDS)[number];

// Map each threshold to the column we stamp after a successful send.
const COLUMN_FOR_THRESHOLD: Record<ThresholdDays, string> = {
  30: 'last_reminder_30d_at',
  14: 'last_reminder_14d_at',
  7: 'last_reminder_7d_at',
};

// Friendly label for the email subject + body.
const LABEL_FOR_THRESHOLD: Record<ThresholdDays, string> = {
  30: 'in 30 days',
  14: 'in 14 days',
  7: 'in 7 days',
};

interface ReminderRow {
  id: string;
  document_name: string;
  document_code: string;
  expires_at: string;
  last_reminder_30d_at: string | null;
  last_reminder_14d_at: string | null;
  last_reminder_7d_at: string | null;
  staff: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

interface SendResult {
  reminded_30d: number;
  reminded_14d: number;
  reminded_7d: number;
}

function buildReminderEmailHtml(args: {
  employeeName: string;
  documentName: string;
  daysLabel: string;
  expiresAt: string;
  myDocumentsUrl: string;
}): string {
  const { employeeName, documentName, daysLabel, expiresAt, myDocumentsUrl } = args;
  const expiryFormatted = new Date(expiresAt).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;max-width:640px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#18181b;padding:24px 32px;text-align:center;">
<p style="margin:0;color:#71717a;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">JKKN HR — Document Expiry</p>
<h1 style="margin:8px 0 0;color:#fff;font-size:18px;font-weight:600;">Reminder: ${documentName} expires ${daysLabel}</h1>
</td></tr>
<tr><td style="padding:28px 32px 12px;">
<p style="margin:0 0 16px;font-size:14px;color:#27272a;line-height:1.55;">Hi ${employeeName || 'there'},</p>
<p style="margin:0 0 16px;font-size:14px;color:#27272a;line-height:1.55;">Your <strong>${documentName}</strong> on file with HR will expire <strong>${daysLabel}</strong> (on <strong>${expiryFormatted}</strong>). Please re-upload a current version before it expires so HR can re-verify it.</p>
</td></tr>
<tr><td style="padding:8px 32px 24px;text-align:center;">
<a href="${myDocumentsUrl}" style="display:inline-block;padding:12px 24px;background:#0a3d2c;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Open My Documents</a>
<p style="margin:12px 0 0;font-size:11px;color:#71717a;">Click to upload the renewal.</p>
</td></tr>
<tr><td style="padding:0 32px 28px;">
<p style="margin:0;font-size:12px;color:#71717a;line-height:1.5;">If you have already submitted a renewal that HR hasn&rsquo;t verified yet, you can ignore this reminder.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Returns which threshold (if any) the row should fire today, given the
 * current state of its `last_reminder_<N>d_at` columns.
 *
 * Rule: pick the LARGEST threshold whose window the row's days_until_expiry
 * has fallen into AND for which we haven't yet stamped a reminder.
 */
function pickThreshold(
  daysUntilExpiry: number,
  row: Pick<
    ReminderRow,
    'last_reminder_30d_at' | 'last_reminder_14d_at' | 'last_reminder_7d_at'
  >
): ThresholdDays | null {
  // 7-day reminder takes precedence if we're inside the 7-day window AND
  // we haven't stamped 7d yet. We check thresholds smallest-first so a row
  // that crosses several windows in a single day will still get the most
  // urgent one. (In practice, the daily cron means a row only crosses one
  // threshold per day; this is just defense against backfills.)
  if (daysUntilExpiry <= 7 && daysUntilExpiry > 0 && !row.last_reminder_7d_at) {
    return 7;
  }
  if (daysUntilExpiry <= 14 && daysUntilExpiry > 7 && !row.last_reminder_14d_at) {
    return 14;
  }
  if (daysUntilExpiry <= 30 && daysUntilExpiry > 14 && !row.last_reminder_30d_at) {
    return 30;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  // ---- Auth (CRON_SECRET) ---------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/hr/document-expiry-reminders] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const errors: string[] = [];
  const sent: SendResult = { reminded_30d: 0, reminded_14d: 0, reminded_7d: 0 };

  try {
    // ---- Find candidates --------------------------------------------------
    // Window: rows expiring within 30 days but not yet expired. Use UTC
    // arithmetic to keep "30 days from now" deterministic across timezones —
    // the email body localizes to IST for display.
    const now = new Date();
    const cutoffUpper = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000); // include 30d edge

    const { data, error: queryErr } = await supabase
      .from('hr_employee_documents')
      .select(
        `
        id,
        document_name,
        document_code,
        expires_at,
        last_reminder_30d_at,
        last_reminder_14d_at,
        last_reminder_7d_at,
        staff:staff!hr_employee_documents_staff_id_fkey (
          first_name,
          last_name,
          email
        )
        `
      )
      .eq('verification_status', 'verified')
      .not('expires_at', 'is', null)
      .gt('expires_at', now.toISOString())
      .lte('expires_at', cutoffUpper.toISOString());

    if (queryErr) {
      const msg = `Failed to query candidates: ${queryErr.message}`;
      errors.push(msg);
      return NextResponse.json(
        {
          ok: false,
          found: 0,
          ...sent,
          errors,
          duration_ms: Date.now() - startedAt,
        },
        { status: 500 }
      );
    }

    const candidates = (data ?? []) as unknown as ReminderRow[];

    // ---- Process each candidate ------------------------------------------
    const myDocumentsUrl = `${APP_URL || ''}/hr/documents`;

    for (const row of candidates) {
      try {
        const expiry = new Date(row.expires_at).getTime();
        const daysUntil = Math.ceil((expiry - now.getTime()) / (1000 * 60 * 60 * 24));

        const threshold = pickThreshold(daysUntil, row);
        if (threshold === null) continue;

        const employeeEmail = row.staff?.email?.trim() ?? '';
        if (!employeeEmail) {
          errors.push(`Skipped row ${row.id}: no employee email on staff record.`);
          continue;
        }
        const employeeName = `${row.staff?.first_name ?? ''} ${row.staff?.last_name ?? ''}`.trim();

        // ---- Send email --------------------------------------------------
        const subject = `Reminder: "${row.document_name}" expires ${LABEL_FOR_THRESHOLD[threshold]}`;
        const html = buildReminderEmailHtml({
          employeeName,
          documentName: row.document_name,
          daysLabel: LABEL_FOR_THRESHOLD[threshold],
          expiresAt: row.expires_at,
          myDocumentsUrl,
        });

        const sendRes = await resend.emails.send({
          from: FROM_EMAIL,
          to: [employeeEmail],
          cc: HR_OFFICER_EMAIL ? [HR_OFFICER_EMAIL] : undefined,
          subject,
          html,
        });

        if (sendRes.error) {
          errors.push(
            `Email failed for row ${row.id} (threshold ${threshold}d): ${sendRes.error.message}`
          );
          continue;
        }

        // ---- Stamp the threshold column AFTER successful send ----------
        const stampCol = COLUMN_FOR_THRESHOLD[threshold];
        const { error: stampErr } = await supabase
          .from('hr_employee_documents')
          .update({ [stampCol]: new Date().toISOString() })
          .eq('id', row.id);

        if (stampErr) {
          // Email already sent — surface the bookkeeping failure but don't
          // mark this as an unsent reminder. Future runs will re-email
          // because the column wasn't stamped; that's the failure mode.
          errors.push(
            `Stamp failed for row ${row.id} threshold ${threshold}d: ${stampErr.message}`
          );
          continue;
        }

        if (threshold === 30) sent.reminded_30d += 1;
        else if (threshold === 14) sent.reminded_14d += 1;
        else if (threshold === 7) sent.reminded_7d += 1;
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : 'unknown error';
        errors.push(`Row ${row.id} processing error: ${msg}`);
      }
    }

    return NextResponse.json({
      ok: true,
      found: candidates.length,
      ...sent,
      errors,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    errors.push(msg);
    return NextResponse.json(
      {
        ok: false,
        found: 0,
        ...sent,
        errors,
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
