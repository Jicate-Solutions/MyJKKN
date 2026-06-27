/**
 * Auto-accountability-meeting engine — trigger evaluation (PR1a)
 * ----------------------------------------------------------------------------
 * Evaluates active `meeting_trigger_rules` against live metrics and, on breach,
 * notifies the responsible role (the college Principal) via the in-app bell.
 *
 * PR1a scope: the attendance trigger only (metric_key='attendance_rate_daily').
 * It DETECTS + NOTIFIES — it does not yet book a meeting (that is PR1c) or run
 * the 24h explanation valve (PR1b). The notification is informational.
 *
 * Server-only: uses the service-role client (the nightly cron has no user
 * session). Notifications are written directly to `notifications` +
 * `user_notifications` (the live bell-delivery contract — see
 * app/api/notifications/send/route.ts). We deliberately do NOT use
 * createNotification() (browser-client, module-level) which would silently fail
 * RLS in a cron, nor targeting-only inserts (which never reach the bell).
 *
 * Guardrails (spec §6): one event per rule per day (UNIQUE constraint),
 * cooldown_days + weekly_cap (≤1/week default), quiet_windows (exam/holiday
 * date ranges). Nothing fires unless a rule is `active` (all seeded inactive).
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionConfig } from '@/types/notifications';

const MODULE = 'meetings/triggers';
const ATTENDANCE_METRIC = 'attendance_rate_daily';
/** PR3: the data-gap trigger — a working day with zero attendance recorded. */
const MISSING_DATA_METRIC = 'attendance_missing_data';
/** Decision #6: the Principal has 24h to explain before a meeting is scheduled. */
const EXPLANATION_WINDOW_HOURS = 24;
/** Re-check the last N days each run so late-marked attendance is still caught (decision E4). */
const LOOKBACK_DAYS = 3;
const MIN_EXPLANATION_LENGTH = 20;

export interface TriggerEvalResult {
  date: string;
  evaluated: number;
  breaches: number;
  notified: number;
  skipped_quiet: number;
  skipped_cooldown: number;
  skipped_no_data: number;
  skipped_no_recipient: number;
  errors: string[];
}

interface TriggerRule {
  id: string;
  metric_key: string;
  institution_id: string | null;
  comparator: string;
  threshold: number;
  cooldown_days: number;
  weekly_cap: number;
  quiet_windows: Array<{ start: string; end: string }> | null;
  notify_role: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function compare(value: number, comparator: string, threshold: number): boolean {
  switch (comparator) {
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'eq':
      return value === threshold;
    case 'ne':
      return value !== threshold;
    default:
      return false;
  }
}

function isInQuietWindow(
  dateISO: string,
  windows: Array<{ start: string; end: string }> | null
): boolean {
  if (!Array.isArray(windows)) return false;
  return windows.some(
    (w) => w?.start && w?.end && dateISO >= w.start && dateISO <= w.end
  );
}

/** Add (or subtract) whole days to an ISO date string, UTC-anchored. */
function addDaysISO(dateISO: string, delta: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * The day to evaluate = "yesterday" in campus time (Asia/Kolkata), so a cron
 * running after midnight UTC still targets the just-completed campus day.
 */
function targetDateIST(now: Date): string {
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  ist.setDate(ist.getDate() - 1);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(ist.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Recipient resolution + notification (live bell-delivery contract)
// ---------------------------------------------------------------------------

interface Recipients {
  recipientIds: string[];
  createdBy: string | null;
  fallbackToAdmin: boolean;
}

/**
 * Resolve who gets the breach notice: the institution's Principal(s). When no
 * principal is on record (e.g. Allied Health / Pharmacy today), fall back to
 * super-admins (the Director) so the breach is NEVER silently dropped.
 */
async function resolveRecipients(
  db: SupabaseClient,
  institutionId: string
): Promise<Recipients> {
  const { data: principals } = await db
    .from('profiles')
    .select('id')
    .eq('institution_id', institutionId)
    .eq('role', 'principal')
    .eq('is_active', true);

  let ids = (principals ?? []).map((r: any) => r.id).filter(Boolean);
  let fallbackToAdmin = false;

  if (ids.length === 0) {
    const { data: admins } = await db
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true)
      .limit(5);
    ids = (admins ?? []).map((r: any) => r.id).filter(Boolean);
    fallbackToAdmin = true;
  }

  return { recipientIds: ids, createdBy: ids[0] ?? null, fallbackToAdmin };
}

async function getInstitutionName(
  db: SupabaseClient,
  institutionId: string
): Promise<string> {
  const { data } = await db
    .from('institutions')
    .select('name')
    .eq('id', institutionId)
    .maybeSingle();
  return (data as any)?.name ?? 'your institution';
}

/**
 * Create an in-app bell notification the live way: insert `notifications` THEN
 * `user_notifications` rows (the bell reads the junction table). Returns the
 * notification id, or null on failure (logged, non-fatal).
 */
async function createBellNotification(
  db: SupabaseClient,
  opts: {
    recipientIds: string[];
    createdBy: string;
    title: string;
    body: string;
    url: string;
    category: string;
    metadata: Record<string, unknown>;
    /**
     * When set, the notification becomes a tracked ACTION (reusing the live
     * acknowledgment framework): the recipient must respond within
     * `deadlineHours`, and their response lands in `action_responses`.
     */
    action?: {
      type: 'urgent' | 'tracked';
      config: ActionConfig;
      deadlineHours: number;
    };
  }
): Promise<string | null> {
  const row: Record<string, unknown> = {
    title: opts.title,
    body: opts.body,
    url: opts.url,
    icon: '/icons/icon-192x192.png',
    priority: 'high',
    category: opts.category,
    created_by: opts.createdBy,
    targeting: { user_ids: opts.recipientIds },
    metadata: opts.metadata
  };
  if (opts.action) {
    row.requires_acknowledgment = true;
    row.acknowledgment_deadline_hours = opts.action.deadlineHours;
    row.action_type = opts.action.type;
    row.action_config = opts.action.config;
  }

  const { data: notif, error } = await db
    .from('notifications')
    .insert(row)
    .select('id')
    .single();

  if (error || !notif) {
    logger.error(MODULE, 'Failed to insert notification', error);
    return null;
  }

  const rows = opts.recipientIds.map((uid) => ({
    user_id: uid,
    notification_id: (notif as any).id
  }));
  const { error: unErr } = await db.from('user_notifications').insert(rows);
  if (unErr) {
    logger.error(MODULE, 'Failed to insert user_notifications', unErr);
  }

  return (notif as any).id as string;
}

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate all active attendance trigger rules for the target day. Idempotent
 * per (rule, day) via the UNIQUE constraint on meeting_trigger_events.
 *
 * @param opts.date  ISO date override (defaults to yesterday, campus time)
 * @param opts.now   clock override (testing)
 * @param opts.client service-role client override (testing)
 */
export async function evaluateAttendanceTriggers(
  opts: { date?: string; now?: Date; client?: SupabaseClient } = {}
): Promise<TriggerEvalResult> {
  const db = opts.client ?? createServiceRoleClient();
  const date = opts.date ?? targetDateIST(opts.now ?? new Date());

  const result: TriggerEvalResult = {
    date,
    evaluated: 0,
    breaches: 0,
    notified: 0,
    skipped_quiet: 0,
    skipped_cooldown: 0,
    skipped_no_data: 0,
    skipped_no_recipient: 0,
    errors: []
  };

  const { data: rules, error } = await db
    .from('meeting_trigger_rules')
    .select('*')
    .eq('metric_key', ATTENDANCE_METRIC)
    .eq('active', true);

  if (error) {
    result.errors.push(`load rules: ${error.message}`);
    return result;
  }

  // Newest-first look-back window so attendance marked late (after a prior
  // run) is still caught (decision E4). [yesterday, -2, -3].
  const candidateDates = Array.from({ length: LOOKBACK_DAYS }, (_, i) =>
    addDaysISO(date, -i)
  );

  for (const rule of (rules ?? []) as TriggerRule[]) {
    if (!rule.institution_id) continue; // global rules unsupported
    result.evaluated++;

    try {
      // Cooldown + weekly cap — ONCE per rule, over the trailing window ending
      // at the newest day. Caps the rule to `cap` events/window no matter how
      // many of the looked-back days breach.
      const cooldownDays = rule.cooldown_days ?? 7;
      const cap = rule.weekly_cap ?? 1;
      const windowStart = addDaysISO(date, -(cooldownDays - 1));
      const { data: recent } = await db
        .from('meeting_trigger_events')
        .select('id')
        .eq('rule_id', rule.id)
        .gte('breach_date', windowStart)
        .lte('breach_date', date);
      if ((recent?.length ?? 0) >= cap) {
        result.skipped_cooldown++;
        continue;
      }

      // Evaluate the window newest-first; fire on the first breaching day.
      let fired = false;
      let sawData = false;
      for (const candDate of candidateDates) {
        // Quiet window (exam weeks / holidays) for this specific day.
        if (isInQuietWindow(candDate, rule.quiet_windows)) continue;

        const { data: rate, error: rpcErr } = await db.rpc(
          'fn_college_day_attendance_rate',
          { p_institution_id: rule.institution_id, p_date: candDate }
        );
        if (rpcErr) {
          result.errors.push(
            `rpc ${rule.institution_id} ${candDate}: ${rpcErr.message}`
          );
          continue;
        }
        // No attendance that day → missing-data is a separate trigger (PR3),
        // never a false 0% breach here.
        if (rate === null || rate === undefined) continue;
        sawData = true;
        const rateNum = Number(rate);

        // Breach? (comparator is per-rule — 'lte' means at-or-below, decision E9.)
        if (!compare(rateNum, rule.comparator, Number(rule.threshold))) continue;

        // Resolve recipients (principal → admin fallback).
        const { recipientIds, createdBy, fallbackToAdmin } =
          await resolveRecipients(db, rule.institution_id);
        if (recipientIds.length === 0 || !createdBy) {
          result.skipped_no_recipient++;
          logger.warn(MODULE, 'Breach with no resolvable recipient', {
            institution_id: rule.institution_id,
            date: candDate
          });
          break; // no one to notify for this institution — stop the window
        }

        // Record the event (idempotent per rule+day).
        const explanationDeadline = new Date(
          Date.now() + EXPLANATION_WINDOW_HOURS * 60 * 60 * 1000
        ).toISOString();
        const { data: ev, error: evErr } = await db
          .from('meeting_trigger_events')
          .insert({
            rule_id: rule.id,
            institution_id: rule.institution_id,
            metric_key: rule.metric_key,
            observed_value: rateNum,
            threshold: rule.threshold,
            breach_date: candDate,
            status: 'notified',
            explanation_deadline: explanationDeadline
          })
          .select('id')
          .single();
        if (evErr) {
          // 23505 = already handled this rule+day → try the next older day.
          if ((evErr as any).code === '23505') continue;
          result.errors.push(
            `event ${rule.institution_id} ${candDate}: ${evErr.message}`
          );
          continue;
        }

        result.breaches++;

        // Notify — supportive tone (decision E6): ask for context, not blame.
        const instName = await getInstitutionName(db, rule.institution_id);
        const notificationId = await createBellNotification(db, {
          recipientIds,
          createdBy,
          title: `Attendance check-in — ${instName}`,
          body:
            `${instName} recorded ${rateNum}% attendance on ${candDate}, below the ` +
            `${rule.threshold}% line being tracked. Could you help us understand what ` +
            `happened that day? Please add a brief note within ${EXPLANATION_WINDOW_HOURS} ` +
            `hours so we have the context.` +
            (fallbackToAdmin
              ? ' (No principal on record yet — routed to administration.)'
              : ''),
          url: '/academic/attendance',
          category: 'attendance:breach',
          action: {
            type: 'tracked',
            deadlineHours: EXPLANATION_WINDOW_HOURS,
            config: {
              response_type: 'text',
              min_text_length: MIN_EXPLANATION_LENGTH
            }
          },
          metadata: {
            rule_id: rule.id,
            institution_id: rule.institution_id,
            breach_date: candDate,
            observed: rateNum,
            threshold: rule.threshold,
            source: 'cron:attendance-breach-check'
          }
        });

        await db
          .from('meeting_trigger_events')
          .update({
            notified_profile_ids: recipientIds,
            notification_id: notificationId
          })
          .eq('id', (ev as any).id);

        result.notified += recipientIds.length;
        fired = true;
        break; // one event per rule per run
      }

      if (!fired && !sawData) result.skipped_no_data++;
    } catch (e: any) {
      result.errors.push(`rule ${rule.id}: ${e?.message ?? String(e)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// PR3 — missing-data (data-gap) trigger
// ---------------------------------------------------------------------------

/**
 * Evaluate all active missing-data (data-gap) rules. A college-day is a gap when
 * it is a working day (not Sunday, not an approved institution-wide holiday) with
 * ZERO attendance marks — the structural inverse of evaluateAttendanceTriggers,
 * which skips no-data days and leaves them to this trigger. The working-day +
 * zero-marks test lives in SQL (`fn_college_is_missing_data_day`) so it stays
 * consistent with the attendance marking gate. Idempotent per (rule, day).
 *
 * Unlike the attendance trigger, the 3-day window is evaluated OLDEST-first and
 * fires on the oldest still-empty day: a college that simply marked late is not
 * nagged about yesterday (decision E4 — late marking is the whole reason for the
 * look-back). Shares the weekly cap with the low-attendance trigger (E8).
 *
 * Events written here have subject_id IS NULL, so reconcileExplanations runs the
 * same 24h explain → escalate valve over them (no separate reconciler needed).
 */
export async function evaluateMissingDataTriggers(
  opts: { date?: string; now?: Date; client?: SupabaseClient } = {}
): Promise<TriggerEvalResult> {
  const db = opts.client ?? createServiceRoleClient();
  const date = opts.date ?? targetDateIST(opts.now ?? new Date());

  const result: TriggerEvalResult = {
    date,
    evaluated: 0,
    breaches: 0,
    notified: 0,
    skipped_quiet: 0,
    skipped_cooldown: 0,
    skipped_no_data: 0,
    skipped_no_recipient: 0,
    errors: []
  };

  const { data: rules, error } = await db
    .from('meeting_trigger_rules')
    .select('*')
    .eq('metric_key', MISSING_DATA_METRIC)
    .eq('active', true);

  if (error) {
    result.errors.push(`load rules: ${error.message}`);
    return result;
  }

  // Oldest-first window: [-2, -1, target]. Fire on the oldest day that is still
  // a gap, giving late marking the full window to land before we flag it.
  const candidateDates = Array.from({ length: LOOKBACK_DAYS }, (_, i) =>
    addDaysISO(date, -(LOOKBACK_DAYS - 1 - i))
  );

  for (const rule of (rules ?? []) as TriggerRule[]) {
    if (!rule.institution_id) continue; // global rules unsupported
    result.evaluated++;

    try {
      // Cooldown + weekly cap — once per rule, over the trailing window. Caps the
      // rule to `cap` events/window no matter how many looked-back days are gaps.
      const cooldownDays = rule.cooldown_days ?? 7;
      const cap = rule.weekly_cap ?? 1;
      const windowStart = addDaysISO(date, -(cooldownDays - 1));
      const { data: recent } = await db
        .from('meeting_trigger_events')
        .select('id')
        .eq('rule_id', rule.id)
        .gte('breach_date', windowStart)
        .lte('breach_date', date);
      if ((recent?.length ?? 0) >= cap) {
        result.skipped_cooldown++;
        continue;
      }

      let fired = false;
      for (const candDate of candidateDates) {
        if (isInQuietWindow(candDate, rule.quiet_windows)) continue;

        const { data: isGap, error: rpcErr } = await db.rpc(
          'fn_college_is_missing_data_day',
          { p_institution_id: rule.institution_id, p_date: candDate }
        );
        if (rpcErr) {
          result.errors.push(
            `rpc ${rule.institution_id} ${candDate}: ${rpcErr.message}`
          );
          continue;
        }
        // Not a gap (weekend, approved holiday, or attendance present) → skip.
        if (isGap !== true) continue;

        // Resolve recipients (principal → admin fallback).
        const { recipientIds, createdBy, fallbackToAdmin } =
          await resolveRecipients(db, rule.institution_id);
        if (recipientIds.length === 0 || !createdBy) {
          result.skipped_no_recipient++;
          logger.warn(MODULE, 'Data gap with no resolvable recipient', {
            institution_id: rule.institution_id,
            date: candDate
          });
          break; // no one to notify for this institution — stop the window
        }

        // Record the event (idempotent per rule+day). observed_value 0 = "no
        // marks"; threshold is the rule's nominal value (binary metric).
        const explanationDeadline = new Date(
          Date.now() + EXPLANATION_WINDOW_HOURS * 60 * 60 * 1000
        ).toISOString();
        const { data: ev, error: evErr } = await db
          .from('meeting_trigger_events')
          .insert({
            rule_id: rule.id,
            institution_id: rule.institution_id,
            metric_key: rule.metric_key,
            observed_value: 0,
            threshold: rule.threshold,
            breach_date: candDate,
            status: 'notified',
            explanation_deadline: explanationDeadline
          })
          .select('id')
          .single();
        if (evErr) {
          // 23505 = already handled this rule+day → try the next day.
          if ((evErr as any).code === '23505') continue;
          result.errors.push(
            `event ${rule.institution_id} ${candDate}: ${evErr.message}`
          );
          continue;
        }

        result.breaches++;

        // Notify — supportive tone (decision E6): a gap is usually un-entered
        // data, not a missed class. Ask for context, not blame.
        const instName = await getInstitutionName(db, rule.institution_id);
        const notificationId = await createBellNotification(db, {
          recipientIds,
          createdBy,
          title: `Attendance not recorded — ${instName}`,
          body:
            `No attendance was recorded for ${instName} on ${candDate}, a working ` +
            `day. If attendance was taken, please make sure it is entered; if the ` +
            `day had no classes, let us know what happened. A brief note within ` +
            `${EXPLANATION_WINDOW_HOURS} hours keeps this from being escalated.` +
            (fallbackToAdmin
              ? ' (No principal on record yet — routed to administration.)'
              : ''),
          url: '/academic/attendance',
          category: 'missing_data:gap',
          action: {
            type: 'tracked',
            deadlineHours: EXPLANATION_WINDOW_HOURS,
            config: {
              response_type: 'text',
              min_text_length: MIN_EXPLANATION_LENGTH
            }
          },
          metadata: {
            rule_id: rule.id,
            institution_id: rule.institution_id,
            breach_date: candDate,
            observed: 0,
            threshold: rule.threshold,
            source: 'cron:attendance-breach-check'
          }
        });

        await db
          .from('meeting_trigger_events')
          .update({
            notified_profile_ids: recipientIds,
            notification_id: notificationId
          })
          .eq('id', (ev as any).id);

        result.notified += recipientIds.length;
        fired = true;
        break; // one event per rule per run
      }

      if (!fired) result.skipped_no_data++;
    } catch (e: any) {
      result.errors.push(`rule ${rule.id}: ${e?.message ?? String(e)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// PR1b — explanation valve: reconcile responses + Director judgment
// ---------------------------------------------------------------------------

export interface ReconcileResult {
  explained: number;
  escalated: number;
  errors: string[];
}

/** Resolve super-admin profile ids (the Director's reach for routing). */
async function getSuperAdminIds(db: SupabaseClient): Promise<string[]> {
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true)
    .limit(10);
  return (data ?? []).map((r: any) => r.id).filter(Boolean);
}

/**
 * Reconcile open breach events against the explanation valve:
 *  - a Principal explanation (action_responses.text_response) → status
 *    'explained' + route the explanation to the Director to judge.
 *  - no explanation by the 24h deadline → status 'meeting_pending' + alert the
 *    Director that a meeting is warranted (PR1c books it).
 * Idempotent: only acts on status='notified' rows; flips them out of that state.
 */
export async function reconcileExplanations(
  opts: { now?: Date; client?: SupabaseClient } = {}
): Promise<ReconcileResult> {
  const db = opts.client ?? createServiceRoleClient();
  const nowISO = (opts.now ?? new Date()).toISOString();
  const result: ReconcileResult = { explained: 0, escalated: 0, errors: [] };

  const { data: events, error } = await db
    .from('meeting_trigger_events')
    .select(
      'id, rule_id, institution_id, metric_key, observed_value, threshold, breach_date, notification_id, explanation_deadline, status'
    )
    .eq('status', 'notified')
    // Attendance events only — project (subject-scoped) events are reconciled by
    // reconcileProjectExplanations, which routes to the judge, not super-admins.
    // (The column is new; all existing attendance rows have subject_id IS NULL.)
    .is('subject_id', null);
  if (error) {
    result.errors.push(`load events: ${error.message}`);
    return result;
  }

  const admins = await getSuperAdminIds(db);

  for (const ev of (events ?? []) as any[]) {
    try {
      // 1. Did anyone explain? (text response on the breach notification)
      let explained = false;
      if (ev.notification_id) {
        const { data: resp } = await db
          .from('action_responses')
          .select('text_response, user_id, submitted_at')
          .eq('notification_id', ev.notification_id)
          .not('text_response', 'is', null)
          .order('submitted_at', { ascending: true })
          .limit(1);
        const r = (resp ?? [])[0] as any;
        if (r?.text_response) {
          await db
            .from('meeting_trigger_events')
            .update({
              status: 'explained',
              explanation_text: r.text_response,
              explained_at: r.submitted_at,
              explained_by: r.user_id
            })
            .eq('id', ev.id);

          // Route to the Director to judge (skip / meet).
          if (admins.length > 0) {
            const instName = await getInstitutionName(db, ev.institution_id);
            await createBellNotification(db, {
              recipientIds: admins,
              createdBy: admins[0],
              title:
                ev.metric_key === MISSING_DATA_METRIC
                  ? `Data-gap explanation — ${instName}`
                  : `Attendance explanation — ${instName}`,
              body:
                ev.metric_key === MISSING_DATA_METRIC
                  ? `${instName} (no attendance recorded on ${ev.breach_date}) ` +
                    `submitted an explanation:\n\n"${r.text_response}"\n\n` +
                    `Decide whether to skip or still hold a review meeting.`
                  : `${instName} (${ev.observed_value ?? '—'}% on ${ev.breach_date}, ` +
                    `below ${ev.threshold}%) submitted an explanation:\n\n` +
                    `"${r.text_response}"\n\n` +
                    `Decide whether to skip or still hold a review meeting.`,
              url: '/academic/attendance',
              category:
                ev.metric_key === MISSING_DATA_METRIC
                  ? 'missing_data:gap-explained'
                  : 'attendance:breach-explained',
              metadata: {
                event_id: ev.id,
                institution_id: ev.institution_id,
                breach_date: ev.breach_date,
                source: 'cron:meeting-trigger-reconcile'
              }
            });
          }
          result.explained++;
          explained = true;
        }
      }
      if (explained) continue;

      // 2. Deadline passed with no explanation → escalate to a meeting.
      if (ev.explanation_deadline && nowISO > ev.explanation_deadline) {
        await db
          .from('meeting_trigger_events')
          .update({ status: 'meeting_pending' })
          .eq('id', ev.id);

        if (admins.length > 0) {
          const instName = await getInstitutionName(db, ev.institution_id);
          await createBellNotification(db, {
            recipientIds: admins,
            createdBy: admins[0],
            title: `Review meeting warranted — ${instName}`,
            body:
              ev.metric_key === MISSING_DATA_METRIC
                ? `${instName} had no attendance recorded on ${ev.breach_date} and ` +
                  `no explanation was given within ${EXPLANATION_WINDOW_HOURS} hours. ` +
                  `A review meeting with the Director is warranted.`
                : `${instName} recorded ${ev.observed_value ?? '—'}% on ${ev.breach_date} ` +
                  `(below ${ev.threshold}%) and no explanation was given within ` +
                  `${EXPLANATION_WINDOW_HOURS} hours. A review meeting with the ` +
                  `Director is warranted.`,
            url: '/academic/attendance',
            category:
              ev.metric_key === MISSING_DATA_METRIC
                ? 'missing_data:gap-escalated'
                : 'attendance:breach-escalated',
            metadata: {
              event_id: ev.id,
              institution_id: ev.institution_id,
              breach_date: ev.breach_date,
              source: 'cron:meeting-trigger-reconcile'
            }
          });
        }
        result.escalated++;
      }
    } catch (e: any) {
      result.errors.push(`event ${ev.id}: ${e?.message ?? String(e)}`);
    }
  }

  return result;
}

/**
 * Director judgment on a breach event: 'skip' dismisses it, 'meet' marks it for
 * a meeting (PR1c books it). Admin-gated at the route layer.
 */
export async function decideOnEvent(opts: {
  eventId: string;
  decision: 'skip' | 'meet';
  deciderId: string;
  client?: SupabaseClient;
}): Promise<{ ok: boolean; status?: string; error?: string }> {
  const db = opts.client ?? createServiceRoleClient();

  const { data: ev, error } = await db
    .from('meeting_trigger_events')
    .select('id, status')
    .eq('id', opts.eventId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!ev) return { ok: false, error: 'Event not found' };
  if (
    !['notified', 'explained', 'meeting_pending'].includes((ev as any).status)
  ) {
    return {
      ok: false,
      error: `Cannot decide on a ${(ev as any).status} event`
    };
  }

  const newStatus = opts.decision === 'skip' ? 'dismissed' : 'meeting_pending';
  const { error: upErr } = await db
    .from('meeting_trigger_events')
    .update({
      director_decision: opts.decision,
      director_decided_at: new Date().toISOString(),
      director_decided_by: opts.deciderId,
      status: newStatus
    })
    .eq('id', opts.eventId);
  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true, status: newStatus };
}

// ---------------------------------------------------------------------------
// PR2 — project-accountability triggers (task_overdue + project_at_risk)
// ---------------------------------------------------------------------------
// Parallel to the attendance path above: reuses the same module-level helpers
// (compare, isInQuietWindow, createBellNotification, the bell-delivery contract)
// but operates on SUBJECT-scoped events (subject_type/subject_id) whose recipients
// are resolved per-task via RACI. The live attendance functions are untouched —
// reconcileExplanations filters to subject_id IS NULL so it never sees these.

const TASK_OVERDUE_METRIC = 'task_overdue';
const PROJECT_AT_RISK_METRIC = 'project_at_risk';

export interface ProjectTriggerResult {
  date: string;
  evaluated: number;
  breaches: number;
  notified: number;
  skipped_cooldown: number;
  skipped_quiet: number;
  skipped_no_recipient: number;
  errors: string[];
}

/** Today in campus time — project breaches are "as of now", not yesterday. */
function todayIST(now: Date): string {
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(
    ist.getDate()
  ).padStart(2, '0')}`;
}

/** Whole days from `fromISO` to `toISO` (UTC-anchored). */
function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/** project rag_status -> numeric risk level (green/none=0, amber=1, red=2). */
function ragLevel(rag: string | null): number {
  if (rag === 'red') return 2;
  if (rag === 'amber') return 1;
  return 0;
}

/** Map staff ids -> profile ids (assignee.staff_id / owner_staff_id -> staff.profile_id). */
async function mapStaffToProfiles(
  db: SupabaseClient,
  staffIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const ids = [...new Set(staffIds.filter(Boolean))] as string[];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await db.from('staff').select('id, profile_id').in('id', ids);
  for (const r of (data ?? []) as any[]) {
    if (r.profile_id) map.set(r.id, r.profile_id);
  }
  return map;
}

/** The single active global rule for a project metric (or null when inactive). */
async function loadActiveProjectRule(
  db: SupabaseClient,
  metricKey: string
): Promise<TriggerRule | null> {
  const { data } = await db
    .from('meeting_trigger_rules')
    .select(
      'id, metric_key, institution_id, comparator, threshold, cooldown_days, weekly_cap, quiet_windows, notify_role, active'
    )
    .eq('metric_key', metricKey)
    .eq('active', true)
    .is('institution_id', null)
    .maybeSingle();
  return (data as any) ?? null;
}

/** Has this (rule, subject) already fired within cooldown_days? */
async function inSubjectCooldown(
  db: SupabaseClient,
  ruleId: string,
  subjectId: string,
  todayISO: string,
  cooldownDays: number
): Promise<boolean> {
  const since = addDaysISO(todayISO, -Math.max(0, cooldownDays));
  const { data } = await db
    .from('meeting_trigger_events')
    .select('id')
    .eq('rule_id', ruleId)
    .eq('subject_id', subjectId)
    .gte('breach_date', since)
    .limit(1);
  return (data ?? []).length > 0;
}

interface SubjectBreach {
  rule: TriggerRule;
  subjectType: 'task' | 'project';
  subjectId: string;
  subjectLabel: string;
  institutionId: string | null;
  observed: number;
  /** who must explain (the Accountable / project owner) */
  accountableProfile: string;
  /** R + C + I + head — informational bell (deduped, minus accountable) */
  informProfiles: string[];
  /** the reporting head who judges the explanation */
  judgeProfile: string | null;
  noun: string;
  detail: string;
}

/**
 * Record a subject breach event (idempotent per rule+subject+day) and fire the
 * RACI notifications: an actionable explain-or-meet to the Accountable, and an
 * informational bell to Responsible/Consulted/Informed/head.
 */
async function recordAndNotifySubjectBreach(
  db: SupabaseClient,
  b: SubjectBreach,
  todayISO: string,
  createdBy: string | null,
  result: ProjectTriggerResult
): Promise<boolean> {
  const explanationDeadline = new Date(
    Date.now() + EXPLANATION_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data: ev, error: evErr } = await db
    .from('meeting_trigger_events')
    .insert({
      rule_id: b.rule.id,
      institution_id: b.institutionId,
      metric_key: b.rule.metric_key,
      observed_value: b.observed,
      threshold: b.rule.threshold,
      breach_date: todayISO,
      status: 'notified',
      subject_type: b.subjectType,
      subject_id: b.subjectId,
      subject_label: b.subjectLabel,
      judge_profile_id: b.judgeProfile,
      explanation_deadline: explanationDeadline
    })
    .select('id')
    .single();
  if (evErr) {
    if ((evErr as any).code === '23505') return false; // already fired this rule+subject+day
    result.errors.push(`event ${b.subjectType} ${b.subjectId}: ${evErr.message}`);
    return false;
  }

  // Actionable explain-or-meet → the Accountable (supportive tone).
  const notificationId = await createBellNotification(db, {
    recipientIds: [b.accountableProfile],
    createdBy: createdBy ?? b.accountableProfile,
    title: `Accountability check-in — ${b.subjectLabel}`,
    body:
      `The ${b.noun} "${b.subjectLabel}" is ${b.detail}. As the Accountable ` +
      `person, could you add a brief note on what's happening and the plan to ` +
      `resolve it within ${EXPLANATION_WINDOW_HOURS} hours? Otherwise a short ` +
      `meeting with your reporting head will be scheduled.`,
    url: '/projects',
    category: `project:${b.subjectType}-breach`,
    action: {
      type: 'tracked',
      deadlineHours: EXPLANATION_WINDOW_HOURS,
      config: { response_type: 'text', min_text_length: MIN_EXPLANATION_LENGTH }
    },
    metadata: {
      rule_id: b.rule.id,
      subject_type: b.subjectType,
      subject_id: b.subjectId,
      observed: b.observed,
      threshold: b.rule.threshold,
      source: 'cron:project-accountability-check'
    }
  });

  // Informational bell → Responsible / Consulted / Informed / head (deduped).
  const informees = [...new Set(b.informProfiles)].filter(
    (id) => id && id !== b.accountableProfile
  );
  if (informees.length > 0) {
    await createBellNotification(db, {
      recipientIds: informees,
      createdBy: createdBy ?? informees[0],
      title: `Heads-up — ${b.subjectLabel}`,
      body:
        `The ${b.noun} "${b.subjectLabel}" is ${b.detail}. The Accountable ` +
        `person has been asked to explain within ${EXPLANATION_WINDOW_HOURS} ` +
        `hours; a short meeting may follow.`,
      url: '/projects',
      category: `project:${b.subjectType}-breach-info`,
      metadata: {
        rule_id: b.rule.id,
        subject_id: b.subjectId,
        source: 'cron:project-accountability-check'
      }
    });
  }

  await db
    .from('meeting_trigger_events')
    .update({
      notified_profile_ids: [b.accountableProfile, ...informees],
      notification_id: notificationId
    })
    .eq('id', (ev as any).id);

  result.notified += 1 + informees.length;
  return true;
}

/**
 * Evaluate the active project rules (task_overdue + project_at_risk). Idempotent
 * per (rule, subject, day) via the partial unique index on meeting_trigger_events.
 * Nothing runs unless a rule is `active` (both seeded inactive).
 */
export async function evaluateProjectTriggers(
  opts: { now?: Date; client?: SupabaseClient } = {}
): Promise<ProjectTriggerResult> {
  const db = opts.client ?? createServiceRoleClient();
  const today = todayIST(opts.now ?? new Date());
  const result: ProjectTriggerResult = {
    date: today,
    evaluated: 0,
    breaches: 0,
    notified: 0,
    skipped_cooldown: 0,
    skipped_quiet: 0,
    skipped_no_recipient: 0,
    errors: []
  };

  const admins = await getSuperAdminIds(db);
  const createdBy = admins[0] ?? null;

  // ---- task_overdue ----
  const overdueRule = await loadActiveProjectRule(db, TASK_OVERDUE_METRIC);
  if (overdueRule) {
    if (isInQuietWindow(today, overdueRule.quiet_windows)) {
      result.skipped_quiet++;
    } else {
      result.evaluated++;
      const cutoff = addDaysISO(today, -Math.max(0, overdueRule.threshold));
      const { data: tasks, error } = await db
        .from('project_tasks')
        .select(
          'id, title, due_date, project_id, owner_staff_id, projects!inner(institution_id, title)'
        )
        .is('completed_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', cutoff)
        .limit(500);
      if (error) result.errors.push(`task_overdue query: ${error.message}`);

      for (const t of (tasks ?? []) as any[]) {
        try {
          const daysOverdue = daysBetween(t.due_date, today);
          if (!compare(daysOverdue, overdueRule.comparator, overdueRule.threshold)) continue;
          if (await inSubjectCooldown(db, overdueRule.id, t.id, today, overdueRule.cooldown_days)) {
            result.skipped_cooldown++;
            continue;
          }

          const institutionId = t.projects?.institution_id ?? null;
          const { data: assignees } = await db
            .from('project_task_assignees')
            .select('staff_id, role')
            .eq('task_id', t.id);
          const buckets: Record<string, string[]> = {
            accountable: [],
            responsible: [],
            consulted: [],
            informed: []
          };
          for (const a of (assignees ?? []) as any[]) {
            if (a.role in buckets && a.staff_id) buckets[a.role].push(a.staff_id);
          }

          const accountableStaff = buckets.accountable[0] ?? t.owner_staff_id ?? null;
          const otherStaff = [
            ...buckets.responsible,
            ...buckets.consulted,
            ...buckets.informed
          ];
          const staffMap = await mapStaffToProfiles(db, [accountableStaff, ...otherStaff]);

          const head = institutionId
            ? await resolveRecipients(db, institutionId)
            : { recipientIds: [] as string[], createdBy: null, fallbackToAdmin: true };
          const headIds = head.recipientIds;

          let accountableProfile =
            (accountableStaff ? staffMap.get(accountableStaff) : null) ?? null;
          if (!accountableProfile) accountableProfile = admins[0] ?? null;
          if (!accountableProfile) {
            result.skipped_no_recipient++;
            continue;
          }

          const informProfiles = [
            ...otherStaff.map((s) => staffMap.get(s)).filter(Boolean) as string[],
            ...headIds
          ];
          const judgeProfile = headIds[0] ?? admins[0] ?? null;

          const fired = await recordAndNotifySubjectBreach(
            db,
            {
              rule: overdueRule,
              subjectType: 'task',
              subjectId: t.id,
              subjectLabel: t.title ?? 'Untitled task',
              institutionId,
              observed: daysOverdue,
              accountableProfile,
              informProfiles,
              judgeProfile,
              noun: 'task',
              detail: `overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`
            },
            today,
            createdBy,
            result
          );
          if (fired) result.breaches++;
        } catch (e: any) {
          result.errors.push(`task ${t.id}: ${e?.message ?? String(e)}`);
        }
      }
    }
  }

  // ---- project_at_risk ----
  const riskRule = await loadActiveProjectRule(db, PROJECT_AT_RISK_METRIC);
  if (riskRule) {
    if (isInQuietWindow(today, riskRule.quiet_windows)) {
      result.skipped_quiet++;
    } else {
      result.evaluated++;
      const qualifying = ['red', 'amber', 'green'].filter((r) =>
        compare(ragLevel(r), riskRule.comparator, riskRule.threshold)
      );
      if (qualifying.length > 0) {
        const { data: projects, error } = await db
          .from('projects')
          .select('id, title, institution_id, owner_staff_id, rag_status')
          .in('rag_status', qualifying)
          .limit(500);
        if (error) result.errors.push(`project_at_risk query: ${error.message}`);

        for (const p of (projects ?? []) as any[]) {
          try {
            if (await inSubjectCooldown(db, riskRule.id, p.id, today, riskRule.cooldown_days)) {
              result.skipped_cooldown++;
              continue;
            }
            const staffMap = await mapStaffToProfiles(db, [p.owner_staff_id]);
            const head = p.institution_id
              ? await resolveRecipients(db, p.institution_id)
              : { recipientIds: [] as string[], createdBy: null, fallbackToAdmin: true };
            const headIds = head.recipientIds;

            let accountableProfile =
              (p.owner_staff_id ? staffMap.get(p.owner_staff_id) : null) ?? null;
            if (!accountableProfile) accountableProfile = admins[0] ?? null;
            if (!accountableProfile) {
              result.skipped_no_recipient++;
              continue;
            }

            const fired = await recordAndNotifySubjectBreach(
              db,
              {
                rule: riskRule,
                subjectType: 'project',
                subjectId: p.id,
                subjectLabel: p.title ?? 'Untitled project',
                institutionId: p.institution_id ?? null,
                observed: ragLevel(p.rag_status),
                accountableProfile,
                informProfiles: headIds,
                judgeProfile: headIds[0] ?? admins[0] ?? null,
                noun: 'project',
                detail: `flagged at-risk (${p.rag_status})`
              },
              today,
              createdBy,
              result
            );
            if (fired) result.breaches++;
          } catch (e: any) {
            result.errors.push(`project ${p.id}: ${e?.message ?? String(e)}`);
          }
        }
      }
    }
  }

  return result;
}

/**
 * Reconcile open project breach events against the explanation valve. Mirrors
 * reconcileExplanations but for SUBJECT events: routes the explanation (or the
 * "no explanation in 24h" escalation) to the event's judge (the reporting head),
 * not the Director. Idempotent: only acts on status='notified' subject events.
 */
export async function reconcileProjectExplanations(
  opts: { now?: Date; client?: SupabaseClient } = {}
): Promise<ReconcileResult> {
  const db = opts.client ?? createServiceRoleClient();
  const nowISO = (opts.now ?? new Date()).toISOString();
  const result: ReconcileResult = { explained: 0, escalated: 0, errors: [] };

  const { data: events, error } = await db
    .from('meeting_trigger_events')
    .select(
      'id, subject_type, subject_id, subject_label, observed_value, threshold, breach_date, notification_id, explanation_deadline, status, judge_profile_id'
    )
    .eq('status', 'notified')
    .not('subject_id', 'is', null);
  if (error) {
    result.errors.push(`load subject events: ${error.message}`);
    return result;
  }

  for (const ev of (events ?? []) as any[]) {
    try {
      const judge: string[] = ev.judge_profile_id
        ? [ev.judge_profile_id]
        : await getSuperAdminIds(db);

      // 1. Explained?
      if (ev.notification_id) {
        const { data: resp } = await db
          .from('action_responses')
          .select('text_response, user_id, submitted_at')
          .eq('notification_id', ev.notification_id)
          .not('text_response', 'is', null)
          .order('submitted_at', { ascending: true })
          .limit(1);
        const r = (resp ?? [])[0] as any;
        if (r?.text_response) {
          await db
            .from('meeting_trigger_events')
            .update({
              status: 'explained',
              explanation_text: r.text_response,
              explained_at: r.submitted_at,
              explained_by: r.user_id
            })
            .eq('id', ev.id);

          if (judge.length > 0) {
            await createBellNotification(db, {
              recipientIds: judge,
              createdBy: judge[0],
              title: `Explanation submitted — ${ev.subject_label}`,
              body:
                `The Accountable person on "${ev.subject_label}" explained:\n\n` +
                `"${r.text_response}"\n\n` +
                `Decide whether to skip or still hold a short meeting.`,
              url: '/meetings/triggers',
              category: 'project:breach-explained',
              metadata: {
                event_id: ev.id,
                subject_id: ev.subject_id,
                source: 'cron:project-accountability-check'
              }
            });
          }
          result.explained++;
          continue;
        }
      }

      // 2. Deadline passed with no explanation → meeting warranted.
      if (ev.explanation_deadline && nowISO > ev.explanation_deadline) {
        await db
          .from('meeting_trigger_events')
          .update({ status: 'meeting_pending' })
          .eq('id', ev.id);

        if (judge.length > 0) {
          await createBellNotification(db, {
            recipientIds: judge,
            createdBy: judge[0],
            title: `Meeting warranted — ${ev.subject_label}`,
            body:
              `No explanation was given on "${ev.subject_label}" within ` +
              `${EXPLANATION_WINDOW_HOURS} hours. A short accountability meeting ` +
              `is warranted.`,
            url: '/meetings/triggers',
            category: 'project:breach-escalated',
            metadata: {
              event_id: ev.id,
              subject_id: ev.subject_id,
              source: 'cron:project-accountability-check'
            }
          });
        }
        result.escalated++;
      }
    } catch (e: any) {
      result.errors.push(`event ${ev.id}: ${e?.message ?? String(e)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// PR4 — admin console reads/writes
// ---------------------------------------------------------------------------

export interface TriggerRuleWithRate {
  id: string;
  metric_key: string;
  institution_id: string | null;
  college_name: string;
  comparator: string;
  threshold: number;
  cooldown_days: number;
  weekly_cap: number;
  active: boolean;
  notes: string | null;
  avg_rate: number | null;
  latest_rate: number | null;
  latest_date: string | null;
}

/** List all trigger rules with each college's current attendance rate. */
export async function listTriggerRulesWithRates(
  opts: { client?: SupabaseClient } = {}
): Promise<TriggerRuleWithRate[]> {
  const db = opts.client ?? createServiceRoleClient();

  const { data: rules } = await db
    .from('meeting_trigger_rules')
    .select(
      'id, metric_key, institution_id, comparator, threshold, cooldown_days, weekly_cap, active, notes'
    )
    .order('threshold', { ascending: true });

  const instIds = [
    ...new Set((rules ?? []).map((r: any) => r.institution_id).filter(Boolean))
  ];
  const { data: insts } = instIds.length
    ? await db.from('institutions').select('id, name').in('id', instIds)
    : { data: [] as any[] };
  const nameById = new Map((insts ?? []).map((i: any) => [i.id, i.name]));

  const { data: summary } = await db.rpc('fn_college_attendance_summary', {
    p_days: 7
  });
  const rateById = new Map(
    (summary ?? []).map((s: any) => [s.institution_id, s])
  );

  return (rules ?? []).map((r: any) => {
    const s: any = rateById.get(r.institution_id);
    return {
      ...r,
      college_name: nameById.get(r.institution_id) ?? '—',
      avg_rate: s?.avg_rate ?? null,
      latest_rate: s?.latest_rate ?? null,
      latest_date: s?.latest_date ?? null
    } as TriggerRuleWithRate;
  });
}

/** Update an editable rule field (Director console). Validated. */
export async function updateTriggerRule(opts: {
  id: string;
  patch: {
    threshold?: number;
    active?: boolean;
    cooldown_days?: number;
    weekly_cap?: number;
  };
  client?: SupabaseClient;
}): Promise<{ ok: boolean; error?: string }> {
  const db = opts.client ?? createServiceRoleClient();
  const p = opts.patch;
  const update: Record<string, unknown> = {};
  if (typeof p.threshold === 'number' && p.threshold >= 0 && p.threshold <= 100)
    update.threshold = p.threshold;
  if (typeof p.active === 'boolean') update.active = p.active;
  if (typeof p.cooldown_days === 'number' && p.cooldown_days >= 0)
    update.cooldown_days = p.cooldown_days;
  if (typeof p.weekly_cap === 'number' && p.weekly_cap >= 1)
    update.weekly_cap = p.weekly_cap;
  if (Object.keys(update).length === 0)
    return { ok: false, error: 'No valid fields to update' };

  const { error } = await db
    .from('meeting_trigger_rules')
    .update(update)
    .eq('id', opts.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface TriggerEventRow {
  id: string;
  institution_id: string | null;
  college_name: string;
  metric_key: string;
  observed_value: number | null;
  threshold: number;
  breach_date: string;
  status: string;
  explanation_text: string | null;
  director_decision: string | null;
  created_at: string;
  subject_type: string | null;
  subject_label: string | null;
}

/** Recent breach events for the console (newest first). */
export async function listRecentTriggerEvents(
  opts: { limit?: number; client?: SupabaseClient } = {}
): Promise<TriggerEventRow[]> {
  const db = opts.client ?? createServiceRoleClient();
  const { data: events } = await db
    .from('meeting_trigger_events')
    .select(
      'id, institution_id, metric_key, observed_value, threshold, breach_date, status, explanation_text, director_decision, created_at, subject_type, subject_label'
    )
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 30);

  const instIds = [
    ...new Set((events ?? []).map((e: any) => e.institution_id).filter(Boolean))
  ];
  const { data: insts } = instIds.length
    ? await db.from('institutions').select('id, name').in('id', instIds)
    : { data: [] as any[] };
  const nameById = new Map((insts ?? []).map((i: any) => [i.id, i.name]));

  return (events ?? []).map((e: any) => ({
    ...e,
    college_name: nameById.get(e.institution_id) ?? '—'
  })) as TriggerEventRow[];
}
