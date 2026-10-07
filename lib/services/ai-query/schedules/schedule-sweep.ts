/**
 * Scheduled AI Assistant questions — the cron half.
 *
 * Called once per tick from app/api/cron/ai-tasks-sweep/route.ts (every 15 min;
 * no cron of its own — the project is near the Vercel cron ceiling). Two steps,
 * DELIVER first so a run that just finished is out of the way before the next
 * one is queued:
 *
 *   1. DELIVER  fn_ai_query_schedule_claim_deliveries hands back every run whose
 *               answer is ready (or that gave up after 6 hours, or got stuck
 *               while being sent — see §12 of the migration). A good answer
 *               goes to the OWNER ONLY — in-app and/or by email to the owner's
 *               own address, never anyone else's. Then
 *               fn_ai_query_schedule_record_outcome resets or counts failures;
 *               the third failure in a row pauses the schedule.
 *               NOTHING FAILS SILENTLY: when an answer exists but no chosen
 *               channel delivered it, the run counts as a failure AND the owner
 *               is told on the channel that did not just fail. Whenever the
 *               database pauses a schedule — no answer, or answer undelivered —
 *               the owner is told in-app, plus by email if they chose email.
 *   2. ENQUEUE  every active schedule whose next_run_at has passed goes through
 *               fn_ai_enqueue_scheduled, which re-checks the owner's access and
 *               daily question limit before it asks anything.
 *
 * Every database decision (who may run, the cap, the pause) is made in SQL;
 * this file only moves messages. Lane D's completion notifier skips jobs whose
 * payload has schedule_id, so nothing else delivers these answers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification, type FanoutNotificationOptions } from '@/lib/services/_shared/notifications/notify';
import { resend } from '@/lib/resend';
import { describeSchedule, formatIstDateTime } from './next-run';
import { answerExcerpt, buildScheduleEmail, escapeHtml, scheduleLink, type ScheduleArtifactRef } from './schedule-email';
import type { ScheduleCadence, ScheduleChannel } from './types';

const DUE_BATCH = 50;
const DELIVERY_BATCH = 50;
/** A run with no answer after this long counts as failed (and a still-pending job is canceled). */
const RUN_TIMEOUT_MINUTES = 360;
const SOURCE = 'ai-query-schedules';
/** In-app notices leave the bell after 8 days (same span as the Director digest). */
const NOTIFICATION_TTL_MS = 8 * 86_400_000;

interface ClaimedRun {
  schedule_id: string;
  owner_id: string;
  owner_email: string | null;
  title: string;
  question: string;
  cadence: ScheduleCadence;
  weekday: number | null;
  day_of_month: number | null;
  time_ist: string;
  channels: ScheduleChannel[];
  /** NULL when the run's job row no longer exists (job_status 'missing'). */
  job_id: string | null;
  /** an ai_jobs status, or 'timed_out' | 'undelivered' | 'missing' from the claim */
  job_status: string;
  answer: string | null;
  artifacts: unknown;
  timed_out: boolean;
  consecutive_failures: number;
}

interface EnqueueResult {
  ok: boolean;
  status?: string;
  job_id?: string;
  next_run_at?: string;
  cap?: number;
  used?: number;
}

export interface ScheduleEmailMessage {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}

export interface ScheduleSweepDeps {
  notify?: (admin: SupabaseClient, options: FanoutNotificationOptions) => Promise<unknown>;
  sendEmail?: (message: ScheduleEmailMessage) => Promise<void>;
  appUrl?: string;
}

export interface ScheduleSweepSummary {
  delivered: number;
  failed: number;
  paused_after_failures: number;
  enqueued: number;
  due: number;
  skipped: Record<string, number>;
  emails_sent: number;
  email_errors: number;
  errors: string[];
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

async function defaultSendEmail(message: ScheduleEmailMessage): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const { error } = await resend.emails.send(
    { from: FROM_EMAIL, to: message.to, subject: message.subject, html: message.html },
    { headers: { 'Idempotency-Key': message.idempotencyKey } },
  );
  if (error) throw new Error(error.message);
}

function toArtifacts(raw: unknown): ScheduleArtifactRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduleArtifactRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (typeof a.type !== 'string') continue;
    out.push({ type: a.type, title: typeof a.title === 'string' ? a.title : null });
    if (out.length >= 10) break;
  }
  return out;
}

function istDay(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Run one tick. Never throws for a single bad row — each is caught and counted. */
export async function runScheduledReports(
  admin: SupabaseClient,
  deps: ScheduleSweepDeps = {},
  now: Date = new Date(),
): Promise<ScheduleSweepSummary> {
  const notify = deps.notify ?? fanoutNotification;
  const sendEmail = deps.sendEmail ?? defaultSendEmail;
  const appUrl = deps.appUrl ?? (process.env.NEXT_PUBLIC_APP_URL || 'https://www.jkkn.ai');

  const summary: ScheduleSweepSummary = {
    delivered: 0,
    failed: 0,
    paused_after_failures: 0,
    enqueued: 0,
    due: 0,
    skipped: {},
    emails_sent: 0,
    email_errors: 0,
    errors: [],
  };

  const tell = async (ownerId: string, title: string, body: string, key: string, url?: string) => {
    await notify(admin, {
      title,
      body,
      userIds: [ownerId],
      createdBy: ownerId,
      url: url ?? '/ai-query',
      category: 'ai_task',
      kind: 'work_item',
      idempotencyKey: key,
      source: SOURCE,
      // A daily schedule would otherwise pile one unread row per day into the
      // bell for ever; the answer itself stays in the Scheduled tab and email.
      extraColumns: { expires_at: new Date(now.getTime() + NOTIFICATION_TTL_MS).toISOString() },
    });
  };

  const ownerEmail = (run: ClaimedRun): string | null =>
    typeof run.owner_email === 'string' && run.owner_email.includes('@') ? run.owner_email : null;

  /** A short notice email: plain text, escaped, with one link back to the Scheduled tab. */
  const noticeEmail = async (to: string, subject: string, text: string, scheduleId: string, key: string) => {
    await sendEmail({
      to,
      subject,
      html: `<p>${escapeHtml(text)}</p><p><a href="${escapeHtml(scheduleLink(appUrl, scheduleId))}">Open in MyJKKN</a></p>`,
      idempotencyKey: key,
    });
    summary.emails_sent += 1;
  };

  /**
   * Record the outcome. A failed call is LOGGED, never swallowed: the row then
   * stays 'delivering' and the claim RPC retries it once after 30 minutes.
   */
  const recordOutcome = async (run: ClaimedRun, outcome: 'delivered' | 'failed'): Promise<{ paused: boolean } | null> => {
    const { data, error } = await admin.rpc('fn_ai_query_schedule_record_outcome', {
      p_schedule_id: run.schedule_id,
      p_job_id: run.job_id,
      p_outcome: outcome,
    });
    if (error) {
      summary.errors.push(`record ${run.schedule_id}: ${error.message}`);
      return null;
    }
    return { paused: !!(data as { paused?: boolean } | null)?.paused };
  };

  /**
   * The database just paused this schedule after 3 failures in a row. Tell the
   * owner in-app, and by email when they chose email — or when in-app is the
   * channel that just failed, so the notice still has somewhere to go.
   */
  const announcePause = async (run: ClaimedRun, runKey: string, detail: string, emailToo: boolean) => {
    const link = `/ai-query?scheduled=${run.schedule_id}`;
    const body = `We paused "${run.title}" because it failed 3 times in a row (the last time, ${detail}). Open the AI Assistant, then History, then Scheduled, to run it now or resume it.`;
    try {
      await tell(run.owner_id, 'Scheduled question paused', body, `ai_schedule_paused:${runKey}`, link);
    } catch (e) {
      summary.errors.push(`notify pause ${run.schedule_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const email = ownerEmail(run);
    if (emailToo && email) {
      try {
        await noticeEmail(email, `Paused: ${run.title}`, body, run.schedule_id, `ai-schedule-paused-${runKey}`);
      } catch (e) {
        summary.email_errors += 1;
        summary.errors.push(`email pause ${run.schedule_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };

  // ── 1. DELIVER finished runs ────────────────────────────────────────────
  const { data: claimedData, error: claimError } = await admin.rpc('fn_ai_query_schedule_claim_deliveries', {
    p_limit: DELIVERY_BATCH,
    p_timeout_minutes: RUN_TIMEOUT_MINUTES,
  });
  if (claimError) summary.errors.push(`claim: ${claimError.message}`);
  const claimed: ClaimedRun[] = Array.isArray(claimedData) ? (claimedData as ClaimedRun[]) : [];

  for (const run of claimed) {
    try {
      const answer = typeof run.answer === 'string' ? run.answer.trim() : '';
      const answered = run.job_status === 'done' && answer.length > 0;
      const link = `/ai-query?scheduled=${run.schedule_id}`;
      // Idempotency keys are per run; a run whose job row is gone has no job id.
      const runKey = run.job_id ?? `${run.schedule_id}:${istDay(now)}`;
      const wantsEmail = run.channels.includes('email');
      const email = ownerEmail(run);

      if (answered) {
        // No address on file → fall back to in-app so the answer still arrives.
        const wantsInApp = run.channels.includes('in_app') || (wantsEmail && !email);
        let reached = false;
        let inAppFailed = false;
        let emailFailed = false;

        if (wantsInApp) {
          try {
            await tell(run.owner_id, run.title, answerExcerpt(answer), `ai_schedule_answer:${runKey}`, link);
            reached = true;
          } catch (e) {
            inAppFailed = true;
            summary.errors.push(`notify ${run.schedule_id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (wantsEmail && email) {
          const { subject, html } = buildScheduleEmail({
            scheduleId: run.schedule_id,
            title: run.title,
            question: run.question,
            answer,
            artifacts: toArtifacts(run.artifacts),
            cadenceText: describeSchedule(run),
            appUrl,
          });
          try {
            // Only ever the owner's own address, read from their profile by the claim RPC.
            await sendEmail({ to: email, subject, html, idempotencyKey: `ai-schedule-${runKey}` });
            summary.emails_sent += 1;
            reached = true;
          } catch (e) {
            emailFailed = true;
            summary.email_errors += 1;
            summary.errors.push(`email ${run.schedule_id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        if (reached) {
          await recordOutcome(run, 'delivered');
          summary.delivered += 1;
          continue;
        }

        // The answer exists but NO chosen channel delivered it: a failure, and
        // the owner hears about it on the channel that did not just fail.
        const rec = await recordOutcome(run, 'failed');
        summary.failed += 1;
        if (rec?.paused) {
          summary.paused_after_failures += 1;
          await announcePause(run, runKey, 'the answer could not be delivered', wantsEmail || inAppFailed);
          continue;
        }
        const failedBy = [emailFailed ? 'email' : null, inAppFailed ? 'MyJKKN notification' : null]
          .filter(Boolean)
          .join(' or ');
        const note = `Your scheduled answer to "${run.title}" could not be delivered by ${failedBy}. Open the AI Assistant, then History, then Scheduled, to read it.`;
        if (!inAppFailed) {
          try {
            await tell(run.owner_id, 'Scheduled answer not delivered', note, `ai_schedule_undelivered:${runKey}`, link);
          } catch (e) {
            summary.errors.push(`notify undelivered ${run.schedule_id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        } else if (!emailFailed && email) {
          try {
            await noticeEmail(email, `Not delivered: ${run.title}`, note, run.schedule_id, `ai-schedule-undelivered-${runKey}`);
          } catch (e) {
            summary.email_errors += 1;
            summary.errors.push(`email undelivered ${run.schedule_id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        continue;
      }

      // No usable answer (error, timed out, missing job, or stuck twice while
      // being sent): count the failure; the SQL pauses on the third in a row.
      const rec = await recordOutcome(run, 'failed');
      summary.failed += 1;
      if (rec?.paused) {
        summary.paused_after_failures += 1;
        const detail =
          run.job_status === 'undelivered' ? 'the answer could not be delivered' : 'no answer came back';
        await announcePause(run, runKey, detail, wantsEmail);
      }
    } catch (e) {
      summary.errors.push(`deliver ${run.schedule_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 2. ENQUEUE due schedules ────────────────────────────────────────────
  const { data: dueRows, error: dueError } = await admin
    .from('ai_query_schedules')
    .select('id, owner_id, title')
    .eq('active', true)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(DUE_BATCH);
  if (dueError) summary.errors.push(`due: ${dueError.message}`);
  const due = (Array.isArray(dueRows) ? dueRows : []) as { id: string; owner_id: string; title: string }[];
  summary.due = due.length;

  for (const row of due) {
    try {
      const { data, error } = await admin.rpc('fn_ai_enqueue_scheduled', { p_schedule_id: row.id });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as EnqueueResult;
      if (res.ok) {
        summary.enqueued += 1;
        continue;
      }
      const status = res.status ?? 'unknown';
      summary.skipped[status] = (summary.skipped[status] ?? 0) + 1;
      const link = `/ai-query?scheduled=${row.id}`;

      if (status === 'paused_no_access') {
        await tell(
          row.owner_id,
          'Scheduled question paused',
          `We paused "${row.title}" because your account no longer has access to the AI Assistant.`,
          `ai_schedule_no_access:${row.id}:${istDay(now)}`,
          link,
        );
      } else if (status === 'skipped_limit') {
        const next = res.next_run_at ? ` It will run again ${formatIstDateTime(res.next_run_at)}.` : '';
        await tell(
          row.owner_id,
          'Scheduled question skipped',
          `"${row.title}" did not run because you had reached today's limit${res.cap ? ` of ${res.cap}` : ''} AI Assistant questions.${next}`,
          `ai_schedule_limit:${row.id}:${istDay(now)}`,
          link,
        );
      }
    } catch (e) {
      summary.errors.push(`enqueue ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return summary;
}
