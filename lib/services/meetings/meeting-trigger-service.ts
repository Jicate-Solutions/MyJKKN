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

import crypto from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionConfig } from '@/types/notifications';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';
import { zonedToUtc } from './native-slot-engine';

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
  /** Optional: when the college has no Principal, route this rule's alert here. */
  alert_owner_staff_id?: string | null;
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
  institutionId: string,
  alertOwnerStaffId?: string | null
): Promise<Recipients> {
  const { data: principals } = await db
    .from('profiles')
    .select('id')
    .eq('institution_id', institutionId)
    .eq('role', 'principal')
    .eq('is_active', true);

  let ids = (principals ?? []).map((r: any) => r.id).filter(Boolean);
  let fallbackToAdmin = false;

  // No Principal but a designated alert owner is set on the rule → route to that
  // one person instead of fanning out to every super-admin (Director 2026-06-27).
  if (ids.length === 0 && alertOwnerStaffId) {
    const ownerMap = await mapStaffToProfiles(db, [alertOwnerStaffId]);
    const ownerProfile = ownerMap.get(alertOwnerStaffId);
    if (ownerProfile) ids = [ownerProfile];
  }

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
 * it is a working day AND attendance is either ZERO or near-empty (below the
 * rule's % of the college's recent normal) — the structural inverse of
 * evaluateAttendanceTriggers, which skips no-data days and leaves them here. The
 * working-day + gap test lives in SQL (`fn_college_data_gap_check`), which
 * composes the canonical `is_institution_holiday` (the same source the timetable
 * working-day engine uses) rather than re-querying institution_leaves. Idempotent
 * per (rule, day).
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

        // Canonical working-day + zero-OR-near-empty check. Returns the verdict
        // plus the day's mark count and the college's recent normal, so we can
        // record observed_value and word the message accurately. p_min_pct comes
        // from the rule's threshold (Director: 25% of normal).
        const { data: gapRows, error: rpcErr } = await db.rpc(
          'fn_college_data_gap_check',
          {
            p_institution_id: rule.institution_id,
            p_date: candDate,
            p_min_pct: Number(rule.threshold) || 25
          }
        );
        if (rpcErr) {
          result.errors.push(
            `rpc ${rule.institution_id} ${candDate}: ${rpcErr.message}`
          );
          continue;
        }
        const gap = Array.isArray(gapRows) ? gapRows[0] : gapRows;
        // Not a gap (weekend, approved holiday, or enough attendance) → skip.
        if (!gap || gap.is_gap !== true) continue;
        const marks = Number(gap.marks ?? 0);
        const normal = gap.normal != null ? Number(gap.normal) : null;

        // Resolve recipients (principal → rule's alert owner → admin fallback).
        const { recipientIds, createdBy, fallbackToAdmin } =
          await resolveRecipients(
            db,
            rule.institution_id,
            rule.alert_owner_staff_id
          );
        if (recipientIds.length === 0 || !createdBy) {
          result.skipped_no_recipient++;
          logger.warn(MODULE, 'Data gap with no resolvable recipient', {
            institution_id: rule.institution_id,
            date: candDate
          });
          break; // no one to notify for this institution — stop the window
        }

        // Record the event (idempotent per rule+day). observed_value = the day's
        // mark count (0 for a total gap); threshold = the near-empty % line.
        const explanationDeadline = new Date(
          Date.now() + EXPLANATION_WINDOW_HOURS * 60 * 60 * 1000
        ).toISOString();
        const { data: ev, error: evErr } = await db
          .from('meeting_trigger_events')
          .insert({
            rule_id: rule.id,
            institution_id: rule.institution_id,
            metric_key: rule.metric_key,
            observed_value: marks,
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
        const adminNote = fallbackToAdmin
          ? ' (No principal on record yet — routed to administration.)'
          : '';
        const gapTitle =
          marks === 0
            ? `Attendance not recorded — ${instName}`
            : `Attendance looks incomplete — ${instName}`;
        const gapBody =
          marks === 0
            ? `No attendance was recorded for ${instName} on ${candDate}, a working ` +
              `day. If attendance was taken, please make sure it is entered; if the ` +
              `day had no classes, let us know what happened. A brief note within ` +
              `${EXPLANATION_WINDOW_HOURS} hours keeps this from being escalated.` +
              adminNote
            : `Only ${marks} attendance ${marks === 1 ? 'mark was' : 'marks were'} ` +
              `recorded for ${instName} on ${candDate}` +
              (normal
                ? `, far below its usual ~${Math.round(normal)} for a working day`
                : '') +
              `. If more was taken, please make sure it is entered; otherwise let ` +
              `us know what happened. A brief note within ${EXPLANATION_WINDOW_HOURS} ` +
              `hours keeps this from being escalated.` +
              adminNote;
        const notificationId = await createBellNotification(db, {
          recipientIds,
          createdBy,
          title: gapTitle,
          body: gapBody,
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
            observed: marks,
            normal: normal,
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
                  ? `${instName} (${Number(ev.observed_value ?? 0) === 0 ? 'no attendance recorded' : `only ${ev.observed_value} attendance marks`} on ${ev.breach_date}) ` +
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
                ? `${instName} ${Number(ev.observed_value ?? 0) === 0 ? 'had no attendance recorded' : `recorded only ${ev.observed_value} attendance marks`} on ${ev.breach_date} and ` +
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

/**
 * Map staff ids -> profile ids, ACTIVE staff only. Anyone who has left the
 * institution (is_active = false) is intentionally omitted, so a departed
 * Accountable / owner / informee drops out and the caller's fallback chain takes
 * over (Director 2026-06-27: "if the owner left, escalate to the project owner").
 */
async function mapStaffToProfiles(
  db: SupabaseClient,
  staffIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const ids = [...new Set(staffIds.filter(Boolean))] as string[];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await db
    .from('staff')
    .select('id, profile_id, is_active')
    .in('id', ids);
  for (const r of (data ?? []) as any[]) {
    if (r.profile_id && r.is_active) map.set(r.id, r.profile_id);
  }
  return map;
}

/**
 * Is this staff member on APPROVED leave that covers `todayISO`?
 * Reads `hr_leave_applications` (employee_id is a FK to staff.id, so the same
 * staff id the RACI/owner resolution uses applies directly). A row counts when
 * status='approved' and start_date <= today <= end_date. Fail-OPEN: any query
 * error returns false so a leave-table hiccup never silently suppresses a
 * legitimate accountability nudge.
 */
async function isStaffOnApprovedLeave(
  db: SupabaseClient,
  staffId: string | null | undefined,
  todayISO: string
): Promise<boolean> {
  if (!staffId) return false;
  const { data, error } = await db
    .from('hr_leave_applications')
    .select('id')
    .eq('employee_id', staffId)
    .eq('status', 'approved')
    .lte('start_date', todayISO)
    .gte('end_date', todayISO)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
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
          'id, title, due_date, project_id, owner_staff_id, projects!inner(institution_id, title, owner_staff_id)'
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

          const accountableStaff = buckets.accountable[0] ?? null;
          // No Accountable, or the Accountable has left → the project owner
          // answers (Director 2026-06-27). The active-only staff map below makes
          // a departed Accountable fall through automatically. And if the
          // resolved Accountable is on approved leave today, their nudge is
          // deferred one run (isStaffOnApprovedLeave, below).
          const projectOwnerStaff = t.projects?.owner_staff_id ?? null;
          const otherStaff = [
            ...buckets.responsible,
            ...buckets.consulted,
            ...buckets.informed
          ];
          const staffMap = await mapStaffToProfiles(db, [
            accountableStaff,
            projectOwnerStaff,
            ...otherStaff
          ]);

          const head = institutionId
            ? await resolveRecipients(db, institutionId)
            : { recipientIds: [] as string[], createdBy: null, fallbackToAdmin: true };
          const headIds = head.recipientIds;

          // The staff who actually answers for this task: the RACI Accountable
          // if they map to an active profile, else the project owner.
          const accountableStaffId =
            accountableStaff && staffMap.get(accountableStaff)
              ? accountableStaff
              : projectOwnerStaff && staffMap.get(projectOwnerStaff)
                ? projectOwnerStaff
                : null;
          const accountableProfile = accountableStaffId
            ? staffMap.get(accountableStaffId) ?? null
            : null;
          // No real Accountable and no project owner to answer for it → do NOT
          // fall back to nagging a super-admin. Skip this task and leave a
          // diagnostic instead.
          if (!accountableProfile) {
            logger.warn(MODULE, `task ${t.id}: no accountable resolved — skipped`);
            result.skipped_no_recipient++;
            continue;
          }
          // The Accountable is on approved leave today → defer their nudge this
          // run rather than nag someone who is away. It re-evaluates next run.
          if (await isStaffOnApprovedLeave(db, accountableStaffId, today)) {
            logger.warn(
              MODULE,
              `accountable ${accountableStaffId} on approved leave — deferred`
            );
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

            const accountableProfile =
              (p.owner_staff_id ? staffMap.get(p.owner_staff_id) : null) ?? null;
            // No project owner to answer for it → do NOT fall back to nagging a
            // super-admin. Skip this project and leave a diagnostic instead.
            if (!accountableProfile) {
              logger.warn(
                MODULE,
                `project ${p.id}: no accountable resolved — skipped`
              );
              result.skipped_no_recipient++;
              continue;
            }
            // Owner on approved leave today → defer their nudge this run rather
            // than nag someone who is away. It re-evaluates next run.
            if (await isStaffOnApprovedLeave(db, p.owner_staff_id, today)) {
              logger.warn(
                MODULE,
                `accountable ${p.owner_staff_id} on approved leave — deferred`
              );
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
      'id, metric_key, institution_id, comparator, threshold, cooldown_days, weekly_cap, active, notes, alert_owner_staff_id'
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
    alert_owner_staff_id?: string | null;
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
  // null clears the owner; a uuid sets it. undefined leaves it untouched.
  if (p.alert_owner_staff_id === null) update.alert_owner_staff_id = null;
  else if (typeof p.alert_owner_staff_id === 'string')
    update.alert_owner_staff_id = p.alert_owner_staff_id;
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

// ---------------------------------------------------------------------------
// PR1c — book the meeting (with graceful degrade)
// ---------------------------------------------------------------------------
// Closes the loop PR1a/PR1b left open: an escalated breach sat at
// status='meeting_pending' forever because nothing ever booked anything.
//
// This is a PARALLEL pass. It does not touch evaluate*/reconcile* — those run
// LIVE for attendance + projects and only ever hand rows to this pass through
// status='meeting_pending'.
//
// Decision #4 is the load-bearing one: only 21 of ~6,200 profiles have a Google
// Calendar connected (19 active + 2 broken, measured 2026-07-28), and only 2 of
// 11 Principals. So "nobody's calendar is connected" is the COMMON path, not the
// edge case, and this pass is written degrade-first: when anyone in the meeting
// has no healthy connection we do NOT force-book a time onto them — we leave the
// event pending and send the one person who can unblock it a single "connect
// your calendar" ask. The missing meeting is the adoption driver.

/** Decision #3: a short accountability review, not an hour-long meeting. */
const REVIEW_MEETING_MIN = 30;
/** Decision #10: take the soonest slot that works — even a week or two out. */
const BOOKING_HORIZON_DAYS = 14;
/** Campus working window (Asia/Kolkata wall clock): 10:00 → 17:00. */
const WORK_DAY_START_MIN = 10 * 60;
const WORK_DAY_END_MIN = 17 * 60;
/** Never book something starting inside the next two hours. */
const BOOKING_MIN_NOTICE_MIN = 120;
const CAMPUS_TZ = 'Asia/Kolkata';
/** Where an un-connected participant goes to connect Google Calendar. */
const CONNECT_CALENDAR_URL = '/meetings/availability';
/** Free slots to try before giving up on a concurrent-booking race (23P01). */
const SLOT_ATTEMPTS = 5;
/** Bound the work of one cron pass. */
const BOOKING_BATCH_LIMIT = 50;

export interface BookingResult {
  /** meeting_pending events with no booking yet, seen this run. */
  pending_events: number;
  /** folded meetings considered (decision #9: same people + same day = one). */
  groups: number;
  /** meetings actually booked. */
  booked: number;
  /** breach events closed by those bookings. */
  events_booked: number;
  /** people newly asked to connect their calendar (decision #4). */
  calendar_nudges: number;
  /** groups left pending because someone has no healthy calendar. */
  skipped_no_connection: number;
  /** groups left pending because no common free slot exists in the horizon. */
  skipped_no_slot: number;
  /** events with nobody to invite (no recipient, no judge). */
  skipped_no_participants: number;
  /** groups left pending because Google could not be read (fail closed). */
  skipped_calendar_error: number;
  errors: string[];
}

interface PendingEvent {
  id: string;
  institution_id: string | null;
  metric_key: string;
  observed_value: number | null;
  threshold: number;
  breach_date: string;
  subject_type: string | null;
  subject_label: string | null;
  judge_profile_id: string | null;
  notified_profile_ids: string[] | null;
  calendar_nudged_profile_ids: string[] | null;
  booking_error: string | null;
}

interface BookingGroup {
  key: string;
  breachDate: string;
  events: PendingEvent[];
  /** everyone invited: the judge (Director) + the notified owner(s) — decision #11. */
  participantIds: string[];
  /** whose calendar owns the event (the judge). */
  hostId: string;
  /** the person answering for the breach (the Principal / Accountable). */
  attendeeId: string;
  institutionId: string | null;
}

interface Interval {
  start: number;
  end: number;
}

function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Every candidate 30-minute slot in the booking horizon, chronological:
 * working hours in campus time, Sundays skipped, honouring the minimum notice.
 * Asia/Kolkata has no DST but zonedToUtc is used anyway so the conversion stays
 * correct if the campus timezone constant ever changes.
 */
function candidateSlots(now: Date): Interval[] {
  const earliest = now.getTime() + BOOKING_MIN_NOTICE_MIN * 60_000;
  const slots: Interval[] = [];
  let day = todayIST(now);

  for (let i = 0; i <= BOOKING_HORIZON_DAYS; i++) {
    const [y, m, d] = day.split('-').map(Number);
    // 0 = Sunday. Calendar-date weekday is timezone-independent here because the
    // label itself is already the campus-local date.
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (weekday !== 0) {
      for (
        let min = WORK_DAY_START_MIN;
        min + REVIEW_MEETING_MIN <= WORK_DAY_END_MIN;
        min += REVIEW_MEETING_MIN
      ) {
        const start = zonedToUtc(y, m, d, min, CAMPUS_TZ).getTime();
        if (start >= earliest) {
          slots.push({ start, end: start + REVIEW_MEETING_MIN * 60_000 });
        }
      }
    }
    day = addDaysISO(day, 1);
  }
  return slots;
}

/** Stamp a non-fatal reason on every event in a group, without hourly churn. */
async function recordBookingError(
  db: SupabaseClient,
  group: BookingGroup,
  message: string
): Promise<void> {
  const stale = group.events.filter((e) => e.booking_error !== message);
  if (stale.length === 0) return;
  await db
    .from('meeting_trigger_events')
    .update({ booking_error: message })
    .in(
      'id',
      stale.map((e) => e.id)
    );
}

/**
 * Decision #4 degrade path. Ask the un-connected participant(s) — once each, per
 * event — to connect Google Calendar, and leave the breach at meeting_pending so
 * the next run picks it up the moment they do. Returns how many people were
 * newly asked (0 when everyone has already been asked: the pass is idempotent).
 */
async function nudgeToConnectCalendar(
  db: SupabaseClient,
  group: BookingGroup,
  unconnected: string[],
  adminIds: string[],
  now: Date
): Promise<number> {
  const alreadyNudged = new Set<string>();
  for (const ev of group.events) {
    for (const p of ev.calendar_nudged_profile_ids ?? []) alreadyNudged.add(p);
  }
  const toNudge = unconnected.filter((p) => !alreadyNudged.has(p));
  if (toNudge.length === 0) return 0;

  const instName = group.institutionId
    ? await getInstitutionName(db, group.institutionId)
    : 'JKKN';
  const subject = group.events[0]?.subject_label ?? instName;

  await createBellNotification(db, {
    recipientIds: toNudge,
    createdBy: adminIds[0] ?? toNudge[0],
    title: 'Connect your Google Calendar so this review meeting can be scheduled',
    body:
      `A short review meeting about ${subject} (${group.breachDate}) is waiting ` +
      `to be scheduled, but your Google Calendar is not connected — so we cannot ` +
      `see when you are free and will not put a time on your day without it. ` +
      `Open Meetings → Availability and connect Google Calendar; the meeting is ` +
      `then booked automatically at the soonest ${REVIEW_MEETING_MIN}-minute slot ` +
      `everyone shares.`,
    url: CONNECT_CALENDAR_URL,
    category: 'meetings:calendar-connect-needed',
    metadata: {
      event_ids: group.events.map((e) => e.id),
      institution_id: group.institutionId,
      breach_date: group.breachDate,
      unconnected_profile_ids: unconnected,
      source: 'cron:meeting-trigger-reconcile'
    }
  });

  const nextNudged = [...new Set([...alreadyNudged, ...unconnected])];
  await db
    .from('meeting_trigger_events')
    .update({
      calendar_nudge_sent_at: now.toISOString(),
      calendar_nudged_profile_ids: nextNudged,
      booking_error: 'waiting on a Google Calendar connection'
    })
    .in(
      'id',
      group.events.map((e) => e.id)
    );

  return toNudge.length;
}

/**
 * Book the meetings the engine already decided are warranted.
 *
 * Runs after reconcileExplanations in the hourly cron. For every
 * status='meeting_pending' event with no booking yet:
 *   1. resolve who must be in the room — the notified owner(s) (Principal /
 *      alert owner / Accountable) plus the judge (Director / super-admin);
 *   2. fold same-day breaches for the same people into ONE meeting (#9);
 *   3. if EVERY participant has a healthy Google connection, take the soonest
 *      common free 30-minute working-hours slot inside 14 days (#3, #10, #11),
 *      write the meeting_bookings row, add a Google event with a Meet link, and
 *      flip the events to 'booked';
 *   4. otherwise DO NOT book (#4) — nudge the un-connected participant(s) once
 *      and leave the events pending.
 *
 * Never throws: every Google call is wrapped, and any failure leaves the event
 * pending with a readable booking_error so the next run retries it. A Google
 * outage must never crash the cron or lose a breach.
 */
export async function bookPendingMeetings(
  opts: { now?: Date; client?: SupabaseClient; limit?: number } = {}
): Promise<BookingResult> {
  const db = opts.client ?? createServiceRoleClient();
  const now = opts.now ?? new Date();
  const result: BookingResult = {
    pending_events: 0,
    groups: 0,
    booked: 0,
    events_booked: 0,
    calendar_nudges: 0,
    skipped_no_connection: 0,
    skipped_no_slot: 0,
    skipped_no_participants: 0,
    skipped_calendar_error: 0,
    errors: []
  };

  const { data: events, error } = await db
    .from('meeting_trigger_events')
    .select(
      'id, institution_id, metric_key, observed_value, threshold, breach_date, subject_type, subject_label, judge_profile_id, notified_profile_ids, calendar_nudged_profile_ids, booking_error'
    )
    .eq('status', 'meeting_pending')
    .is('booking_id', null)
    .order('breach_date', { ascending: true })
    .limit(opts.limit ?? BOOKING_BATCH_LIMIT);

  if (error) {
    // 42703 = undefined_column: the deploy shipped this code before the PR1c
    // migration was applied (MyJKKN deploys ship CODE, not migrations). Report
    // it as a plain note, don't throw — the explanation valve above must keep
    // running, and the very next run after the migration lands picks this up.
    result.errors.push(
      (error as any).code === '42703'
        ? 'booking link migration (meeting_trigger_events.booking_id) not applied yet — nothing booked'
        : `load pending events: ${error.message}`
    );
    return result;
  }

  const pending = (events ?? []) as unknown as PendingEvent[];
  result.pending_events = pending.length;
  // The state today: 0 events, all rules dormant. Clean no-op, no Google calls,
  // no admin lookup, nothing written.
  if (pending.length === 0) return result;

  const adminIds = await getSuperAdminIds(db);

  // --- 1 + 2. resolve participants, then fold same-day duplicates (#9) -------
  const groups = new Map<string, BookingGroup>();
  for (const ev of pending) {
    try {
      let notified = (ev.notified_profile_ids ?? []).filter(Boolean);
      if (notified.length === 0 && ev.institution_id) {
        notified = (await resolveRecipients(db, ev.institution_id)).recipientIds;
      }

      // Decision #11 is a two-sided meeting: the judge, plus whoever actually
      // has to answer for the breach. Who that is differs by engine:
      //  - project events store [accountable, ...informees] — the informees got
      //    a heads-up bell, not a summons, so only the FIRST is in the room;
      //  - attendance events asked every recipient to explain, so they all
      //    belong — but capped, because the no-principal fallback fans out to
      //    up to 5 super-admins and a 6-person review is neither intended by
      //    #11 nor realistically schedulable.
      const people = ev.subject_type ? notified.slice(0, 1) : notified.slice(0, 2);

      // Project events carry their own judge; attendance events answer to the
      // Director (first super-admin).
      const judge = ev.judge_profile_id ?? adminIds[0] ?? null;
      const participantIds = [
        ...new Set([...(judge ? [judge] : []), ...people])
      ].filter(Boolean) as string[];

      if (participantIds.length === 0) {
        result.skipped_no_participants++;
        continue;
      }

      const hostId = judge ?? participantIds[0];
      const attendeeId =
        people.find((p) => p !== hostId) ?? people[0] ?? hostId;

      // Same people + same breach day → one meeting, not one per breach.
      const key = `${ev.breach_date}|${[...participantIds].sort().join(',')}`;
      const existing = groups.get(key);
      if (existing) {
        existing.events.push(ev);
      } else {
        groups.set(key, {
          key,
          breachDate: ev.breach_date,
          events: [ev],
          participantIds,
          hostId,
          attendeeId,
          institutionId: ev.institution_id
        });
      }
    } catch (e: any) {
      result.errors.push(`event ${ev.id}: ${e?.message ?? String(e)}`);
    }
  }
  result.groups = groups.size;

  // --- 3 + 4. book, or degrade -----------------------------------------------
  for (const group of groups.values()) {
    try {
      // Everyone's calendar must be connected AND healthy (decision #4).
      const { data: conns } = await db
        .from('meeting_host_google_connections')
        .select('host_profile_id, google_email, status')
        .in('host_profile_id', group.participantIds);

      const connectedEmail = new Map<string, string>();
      for (const c of (conns ?? []) as any[]) {
        if (c?.status === 'active' && c.host_profile_id) {
          connectedEmail.set(c.host_profile_id, c.google_email);
        }
      }
      const unconnected = group.participantIds.filter(
        (p) => !connectedEmail.has(p)
      );

      if (unconnected.length > 0) {
        result.skipped_no_connection++;
        result.calendar_nudges += await nudgeToConnectCalendar(
          db,
          group,
          unconnected,
          adminIds,
          now
        );
        continue;
      }

      // --- availability: Google freeBusy, fail CLOSED on any read failure ----
      const windowStartIso = new Date(
        now.getTime() + BOOKING_MIN_NOTICE_MIN * 60_000
      ).toISOString();
      const windowEndIso = new Date(
        now.getTime() + (BOOKING_HORIZON_DAYS + 1) * 86_400_000
      ).toISOString();

      const busy: Interval[] = [];
      let calendarFailed = false;

      for (const pid of group.participantIds) {
        try {
          const res = await GoogleCalendarService.busyForHost(
            db,
            pid,
            windowStartIso,
            windowEndIso
          );
          if (res.status === 'ok') {
            for (const b of res.busy) {
              const s = Date.parse(b.start);
              const e = Date.parse(b.end);
              if (Number.isFinite(s) && Number.isFinite(e)) {
                busy.push({ start: s, end: e });
              }
            }
          } else {
            // 'failed' (Google error) or 'none' (connection vanished between the
            // check above and now) — never guess at someone's availability.
            calendarFailed = true;
          }
        } catch (e: any) {
          calendarFailed = true;
          result.errors.push(`freeBusy ${pid}: ${e?.message ?? String(e)}`);
        }
      }

      if (calendarFailed) {
        result.skipped_calendar_error++;
        await recordBookingError(
          db,
          group,
          'Google Calendar availability could not be read; will retry next run'
        );
        continue;
      }

      // Anything already on the JKKN side counts as busy too — a booking that
      // never reached Google (or predates the connection) must still block.
      const { data: existingBookings } = await db
        .from('meeting_bookings')
        .select('start_time, end_time')
        .in('host_profile_id', group.participantIds)
        .eq('status', 'confirmed')
        .lt('start_time', windowEndIso)
        .gt('end_time', windowStartIso);
      for (const b of (existingBookings ?? []) as any[]) {
        const s = Date.parse(b.start_time);
        const e = Date.parse(b.end_time);
        if (Number.isFinite(s) && Number.isFinite(e)) busy.push({ start: s, end: e });
      }

      const freeSlots = candidateSlots(now).filter(
        (s) => !busy.some((b) => intervalsOverlap(s, b))
      );
      if (freeSlots.length === 0) {
        result.skipped_no_slot++;
        await recordBookingError(
          db,
          group,
          `no common free ${REVIEW_MEETING_MIN}-minute slot in the next ${BOOKING_HORIZON_DAYS} days`
        );
        continue;
      }

      // --- identities for the booking row + the calendar invite -------------
      const { data: profs } = await db
        .from('profiles')
        .select('id, full_name, email')
        .in('id', group.participantIds);
      const profById = new Map(
        ((profs ?? []) as any[]).map((p) => [p.id, p])
      );
      const emailOf = (id: string): string | null =>
        profById.get(id)?.email ?? connectedEmail.get(id) ?? null;
      const nameOf = (id: string): string =>
        profById.get(id)?.full_name ?? 'JKKN';

      const attendeeEmail = emailOf(group.attendeeId);
      if (!attendeeEmail) {
        result.errors.push(
          `group ${group.key}: no email for attendee ${group.attendeeId}`
        );
        await recordBookingError(
          db,
          group,
          'the person answering for this breach has no email on file'
        );
        continue;
      }

      const instName = group.institutionId
        ? await getInstitutionName(db, group.institutionId)
        : 'JKKN';
      const label = group.events[0]?.subject_label ?? instName;

      // --- insert the booking; the DB exclusion constraint arbitrates races --
      let booking: { id: string; startIso: string; endIso: string } | null = null;
      let lastErr = '';
      for (const slot of freeSlots.slice(0, SLOT_ATTEMPTS)) {
        const startIso = new Date(slot.start).toISOString();
        const endIso = new Date(slot.end).toISOString();
        const { data: inserted, error: insErr } = await (db as any)
          .from('meeting_bookings')
          .insert({
            uid: crypto.randomBytes(16).toString('base64url'),
            meeting_type_id: null,
            host_profile_id: group.hostId,
            institution_id: group.institutionId,
            attendee_name: nameOf(group.attendeeId),
            attendee_email: attendeeEmail,
            attendee_profile_id: group.attendeeId,
            answers: {
              auto_booked_by: 'meeting-trigger-engine',
              // Decision #9: every folded breach is referenced here, so the
              // meeting can always be traced back to all of its causes.
              trigger_event_ids: group.events.map((e) => e.id),
              breach_date: group.breachDate,
              participant_profile_ids: group.participantIds
            },
            start_time: startIso,
            end_time: endIso,
            status: 'confirmed',
            source: 'trigger-engine'
          })
          .select('id')
          .single();

        if (!insErr && inserted) {
          booking = { id: (inserted as any).id as string, startIso, endIso };
          break;
        }
        lastErr = insErr?.message ?? 'unknown insert error';
        // 23P01 = exclusion_violation: the host got booked in that range while
        // we were computing. Anything else is not worth retrying.
        if ((insErr as any)?.code !== '23P01') break;
      }

      if (!booking) {
        result.errors.push(`group ${group.key}: booking insert failed — ${lastErr}`);
        await recordBookingError(db, group, `booking insert failed: ${lastErr}`);
        continue;
      }

      // --- Google event + Meet link (best effort; never undoes the booking) --
      let meetUrl: string | null = null;
      try {
        const attendees = group.participantIds
          .map((p) => ({ email: emailOf(p), displayName: nameOf(p) }))
          .filter((a): a is { email: string; displayName: string } => !!a.email);

        const created = await GoogleCalendarService.createEvent(db, group.hostId, {
          summary: `Review meeting — ${label}`,
          description:
            `Auto-scheduled by the JKKN accountability engine because the ` +
            `${group.breachDate} threshold breach was not resolved by an ` +
            `explanation.\n\n` +
            group.events
              .map(
                (e) =>
                  `• ${e.metric_key}: observed ${e.observed_value ?? '—'} vs threshold ${e.threshold} on ${e.breach_date}`
              )
              .join('\n'),
          startIso: booking.startIso,
          endIso: booking.endIso,
          timezone: CAMPUS_TZ,
          attendees,
          withMeet: true
        });
        if (created) {
          meetUrl = created.meetUrl;
          await db
            .from('meeting_bookings')
            .update({
              google_event_id: created.eventId,
              video_url: created.meetUrl
            })
            .eq('id', booking.id);
        }
      } catch (e: any) {
        // The meeting exists in JKKN either way; only the calendar copy is lost.
        logger.error(MODULE, 'Google event creation failed for auto-booking', e);
        result.errors.push(
          `google event for booking ${booking.id}: ${e?.message ?? String(e)}`
        );
      }

      // --- close the breach events ------------------------------------------
      const { error: upErr } = await db
        .from('meeting_trigger_events')
        .update({
          status: 'booked',
          booking_id: booking.id,
          booking_error: null
        })
        .in(
          'id',
          group.events.map((e) => e.id)
        );
      if (upErr) {
        result.errors.push(`mark booked ${group.key}: ${upErr.message}`);
      }
      result.booked++;
      result.events_booked += group.events.length;

      // --- tell the room ------------------------------------------------------
      const whenLabel = new Date(booking.startIso).toLocaleString('en-IN', {
        timeZone: CAMPUS_TZ,
        dateStyle: 'medium',
        timeStyle: 'short'
      });
      await createBellNotification(db, {
        recipientIds: group.participantIds,
        createdBy: group.hostId,
        title: `Review meeting scheduled — ${label}`,
        body:
          `A ${REVIEW_MEETING_MIN}-minute review meeting has been scheduled for ` +
          `${whenLabel} (IST) — the first slot everyone was free.` +
          (group.events.length > 1
            ? ` It covers ${group.events.length} items from ${group.breachDate}.`
            : '') +
          (meetUrl ? ` Google Meet: ${meetUrl}` : '') +
          ` It is on your Google Calendar; reply there if you need a different time.`,
        url: '/meetings/inbox',
        category: 'meetings:trigger-meeting-booked',
        metadata: {
          booking_id: booking.id,
          event_ids: group.events.map((e) => e.id),
          institution_id: group.institutionId,
          breach_date: group.breachDate,
          start_time: booking.startIso,
          source: 'cron:meeting-trigger-reconcile'
        }
      });
    } catch (e: any) {
      result.errors.push(`group ${group.key}: ${e?.message ?? String(e)}`);
      logger.error(MODULE, 'bookPendingMeetings group failed', e);
    }
  }

  return result;
}
