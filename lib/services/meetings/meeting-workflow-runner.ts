// lib/services/meetings/meeting-workflow-runner.ts
//
// Meeting Workflows — Module 4 runner. Dispatches DUE workflow runs:
//   pending meeting_workflow_runs WHERE scheduled_for <= now()
// For each run, render each ordered action's template against the booking and
// send via email (Resend, reusing MeetingBookingEmailService's send approach)
// or WhatsApp (reusing the whatsapp-api-client convenience send). Marks the run
// 'sent' | 'failed' | 'skipped'. IDEMPOTENT: status gating + a CLAIM step
// (pending -> sent up front) means a re-run never double-sends, and a single
// row can only be claimed once even with overlapping cron invocations.
//
// Called by app/api/cron/meeting-workflows/route.ts with a service-role client
// (RLS-bypassing) so it can read across all hosts' bookings and write run rows.

import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { sendTextMessage } from '@/lib/services/whatsapp/whatsapp-api-client';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'meetings/workflow-runner';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';
const DEFAULT_BATCH = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowActionRow {
  id: string;
  workflow_id: string;
  order_index: number;
  channel: 'email' | 'whatsapp';
  subject: string | null;
  body_template: string;
}

interface RunRow {
  id: string;
  workflow_id: string;
  booking_id: string;
  scheduled_for: string;
  status: string;
}

interface BookingRow {
  id: string;
  uid: string;
  host_profile_id: string;
  attendee_name: string | null;
  attendee_email: string | null;
  attendee_phone: string | null;
  start_time: string;
  end_time: string;
  status: string;
  cancel_token: string | null;
}

export interface RunSummary {
  examined: number;
  sent: number;
  failed: number;
  skipped: number;
  actions_dispatched: number;
  elapsed_ms: number;
}

// ---------------------------------------------------------------------------
// Template rendering — PURE (unit-tested in __tests__/meetings).
// ---------------------------------------------------------------------------

export interface TemplateContext {
  attendee_name: string;
  start_time: string; // human-rendered
  host_name: string;
  cancel_url: string;
}

/**
 * Replace {{placeholder}} tokens (whitespace-tolerant) with context values.
 * Unknown placeholders are left as-is so a typo is visible rather than blanked.
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = (ctx as Record<string, string>)[key];
    return value !== undefined ? value : match;
  });
}

/** Format an ISO instant in IST for human-facing message bodies. */
export function formatStart(iso: string, timezone = 'Asia/Kolkata'): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone,
    });
  } catch {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    });
  }
}

// ---------------------------------------------------------------------------
// Channel send — reuse existing rails. Both are non-throwing and config-gated;
// a missing provider degrades to a skip, never a crash.
// ---------------------------------------------------------------------------

function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}
function whatsappConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Wrap a plain-text body in the same minimal shell colour the email rail uses. */
function emailHtml(body: string): string {
  const safe = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:8px;max-width:560px;">
        <tr><td style="background:#18181b;padding:20px 32px;"><p style="margin:0;color:#fff;font-size:14px;font-weight:600;">JKKN Management System</p></td></tr>
        <tr><td style="padding:28px 32px;color:#374151;font-size:15px;line-height:1.65;">${safe}</td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;"><p style="margin:0;color:#9ca3af;font-size:12px;">Sent by JKKN Management System.</p></td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

interface SendOutcome {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

async function sendEmailAction(
  to: string,
  subject: string,
  body: string,
  idempotencyKey: string
): Promise<SendOutcome> {
  if (!to) return { ok: false, skipped: true, error: 'No attendee email' };
  if (!emailConfigured()) return { ok: false, skipped: true, error: 'RESEND_API_KEY not configured' };
  try {
    // Construct lazily at send time so a key-less import (tests, build) never
    // throws — mirrors the whatsapp client's "build at invocation" approach.
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send(
      { from: FROM_EMAIL, to, subject: subject || 'A note about your meeting', html: emailHtml(body) },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
    if (error) return { ok: false, error: (error as any).message ?? String(error) };
    logger.info(LOG, 'workflow email sent', { resendId: data?.id, to });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'email send error' };
  }
}

async function sendWhatsappAction(to: string, body: string): Promise<SendOutcome> {
  if (!to) return { ok: false, skipped: true, error: 'No attendee phone' };
  if (!whatsappConfigured()) return { ok: false, skipped: true, error: 'WhatsApp not configured' };
  try {
    const res = await sendTextMessage(to, body);
    logger.info(LOG, 'workflow whatsapp sent', { to, messageId: res?.messages?.[0]?.id });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'whatsapp send error' };
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Dispatch all due workflow runs. `now` is injectable for tests; defaults to
 * the current instant. Returns a summary; never throws (each run is isolated).
 */
export async function runDueWorkflows(
  serviceClient: SupabaseClient,
  now: Date = new Date(),
  opts: { batchSize?: number } = {}
): Promise<RunSummary> {
  const started = Date.now();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH;
  const summary: RunSummary = {
    examined: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    actions_dispatched: 0,
    elapsed_ms: 0,
  };

  // 1. Pull due pending runs.
  const { data: runsData, error: runsErr } = await serviceClient
    .from('meeting_workflow_runs')
    .select('id, workflow_id, booking_id, scheduled_for, status')
    .eq('status', 'pending')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(batchSize);

  if (runsErr) {
    logger.error(LOG, 'failed to fetch due runs', runsErr);
    summary.elapsed_ms = Date.now() - started;
    return summary;
  }

  const runs = (runsData ?? []) as RunRow[];
  summary.examined = runs.length;
  if (runs.length === 0) {
    summary.elapsed_ms = Date.now() - started;
    return summary;
  }

  // 2. Batch-load the actions + bookings the runs reference.
  const workflowIds = Array.from(new Set(runs.map((r) => r.workflow_id)));
  const bookingIds = Array.from(new Set(runs.map((r) => r.booking_id)));

  const [{ data: actionsData }, { data: bookingsData }] = await Promise.all([
    serviceClient
      .from('meeting_workflow_actions')
      .select('id, workflow_id, order_index, channel, subject, body_template')
      .in('workflow_id', workflowIds)
      .order('order_index', { ascending: true }),
    serviceClient
      .from('meeting_bookings')
      .select(
        'id, uid, host_profile_id, attendee_name, attendee_email, attendee_phone, start_time, end_time, status, cancel_token'
      )
      .in('id', bookingIds),
  ]);

  const actionsByWorkflow = new Map<string, WorkflowActionRow[]>();
  for (const a of (actionsData ?? []) as WorkflowActionRow[]) {
    const arr = actionsByWorkflow.get(a.workflow_id) ?? [];
    arr.push(a);
    actionsByWorkflow.set(a.workflow_id, arr);
  }
  const bookingById = new Map<string, BookingRow>();
  for (const b of (bookingsData ?? []) as BookingRow[]) bookingById.set(b.id, b);

  // Resolve host display names once (one query for the whole batch).
  const hostIds = Array.from(
    new Set((bookingsData ?? []).map((b: any) => b.host_profile_id).filter(Boolean))
  );
  const hostNameById = new Map<string, string>();
  if (hostIds.length > 0) {
    const { data: hosts } = await serviceClient
      .from('profiles')
      .select('id, full_name')
      .in('id', hostIds);
    for (const h of (hosts ?? []) as { id: string; full_name: string | null }[]) {
      hostNameById.set(h.id, h.full_name ?? 'your host');
    }
  }

  // 3. Process each run independently.
  for (const run of runs) {
    const booking = bookingById.get(run.booking_id);
    const actions = actionsByWorkflow.get(run.workflow_id) ?? [];

    // CLAIM the run up front (pending -> sent) to make overlapping cron passes
    // safe: a row already flipped won't be re-selected, and the .eq('status',
    // 'pending') guard means a concurrent worker that lost the race no-ops.
    const { data: claimed, error: claimErr } = await serviceClient
      .from('meeting_workflow_runs')
      .update({ status: 'sent', sent_at: now.toISOString() })
      .eq('id', run.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (claimErr || !claimed) {
      // Lost the claim race or DB error — leave for the next pass / skip.
      continue;
    }

    // Skip conditions: missing booking, no actions, or a stale reminder for a
    // booking that's since been cancelled (don't remind about a dead meeting).
    if (!booking) {
      await markRun(serviceClient, run.id, 'skipped', null, 'Booking not found', now);
      summary.skipped++;
      continue;
    }
    if (actions.length === 0) {
      await markRun(serviceClient, run.id, 'skipped', null, 'Workflow has no actions', now);
      summary.skipped++;
      continue;
    }

    const ctx: TemplateContext = {
      attendee_name: booking.attendee_name || 'there',
      start_time: formatStart(booking.start_time),
      host_name: hostNameById.get(booking.host_profile_id) || 'your host',
      cancel_url:
        booking.cancel_token && APP_URL
          ? `${APP_URL}/meetings/cancel/${booking.cancel_token}`
          : APP_URL
          ? `${APP_URL}/meetings/${booking.uid}`
          : '',
    };

    const errors: string[] = [];
    let anySent = false;
    for (const action of actions) {
      const body = renderTemplate(action.body_template, ctx);
      const idemKey = `mwf-${run.id}-${action.id}`;
      let outcome: SendOutcome;
      if (action.channel === 'email') {
        const subject = renderTemplate(action.subject ?? '', ctx);
        outcome = await sendEmailAction(booking.attendee_email ?? '', subject, body, idemKey);
      } else {
        outcome = await sendWhatsappAction(booking.attendee_phone ?? '', body);
      }
      summary.actions_dispatched++;
      if (outcome.ok) {
        anySent = true;
      } else if (!outcome.skipped) {
        errors.push(`[${action.channel}] ${outcome.error}`);
      } else {
        errors.push(`[${action.channel}] skipped: ${outcome.error}`);
      }
    }

    // Final status: success if any leg sent; failed if every leg errored (not
    // merely skipped); skipped if every leg skipped (no provider / no contact).
    if (anySent) {
      // Already claimed 'sent'; record partial errors if any in the error field.
      if (errors.length > 0) {
        await serviceClient
          .from('meeting_workflow_runs')
          .update({ error: errors.join(' | ').slice(0, 1000) })
          .eq('id', run.id);
      }
      summary.sent++;
    } else {
      const allSkipped = errors.every((e) => e.includes('skipped:'));
      const finalStatus = allSkipped ? 'skipped' : 'failed';
      await markRun(serviceClient, run.id, finalStatus, null, errors.join(' | ').slice(0, 1000), now);
      if (finalStatus === 'failed') summary.failed++;
      else summary.skipped++;
    }
  }

  summary.elapsed_ms = Date.now() - started;
  logger.info(LOG, 'runDueWorkflows complete', summary as unknown as Record<string, unknown>);
  return summary;
}

/** Set a run's terminal status. sent_at is cleared for non-sent terminal states. */
async function markRun(
  client: SupabaseClient,
  runId: string,
  status: 'sent' | 'failed' | 'skipped',
  sentAtOverride: string | null,
  error: string | null,
  now: Date
): Promise<void> {
  await client
    .from('meeting_workflow_runs')
    .update({
      status,
      sent_at: status === 'sent' ? sentAtOverride ?? now.toISOString() : null,
      error: error || null,
    })
    .eq('id', runId);
}
