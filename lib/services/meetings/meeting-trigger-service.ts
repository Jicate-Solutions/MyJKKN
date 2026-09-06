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
// PR1c reuses the platform's EXISTING slot engine rather than re-implementing
// availability — see the "no parallel slot engine" note in the PR1c section.
import {
  computeSlots,
  intersectCollectiveSlots,
  type EngineWindow,
  type EngineOverride,
  type Slot
} from './native-slot-engine';

const MODULE = 'meetings/triggers';
const ATTENDANCE_METRIC = 'attendance_rate_daily';
/** PR3: the data-gap trigger — a working day with zero attendance recorded. */
const MISSING_DATA_METRIC = 'attendance_missing_data';
/** Decision #6: the Principal has 24h to explain before a meeting is scheduled. */
const EXPLANATION_WINDOW_HOURS = 24;
/**
 * Director decision 2026-07-30 #4: nudge once before the window closes rather
 * than putting a meeting on someone's calendar with no warning. Most people
 * answer after a reminder, so this should mean far fewer auto-booked meetings —
 * and nobody can say a review meeting appeared out of nowhere while they were
 * travelling. Sent AT MOST ONCE per event, enforced by the DB's idempotency
 * index rather than a read-then-write check.
 */
const REMINDER_BEFORE_DEADLINE_HOURS = 4;
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
    .eq('is_active', true)
    // Deterministic (review fix #3): several colleges have >1 principal profile,
    // and recipientIds[0] becomes created_by / the person summoned to the
    // meeting. Un-ordered, that identity could change between two hourly runs.
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

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
    // Same determinism fix as getSuperAdminIds: an un-ordered .limit(5) over 14
    // super-admins picked a different five (and a different [0]) run to run.
    const { data: admins } = await db
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
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
 *
 * EXPORTED (2026-08-05, Director's Desk chase engine). The handover chase is a
 * new SUBJECT TYPE on this same engine, not a second engine, so it must send
 * down this exact path — the same `notifications` + `user_notifications` pair,
 * the same idempotency index. A copy in another file is how two "identical"
 * senders drift until one of them stops reaching the bell.
 */
export async function createBellNotification(
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
    /**
     * When set, the DB's own partial UNIQUE index
     * (idx_notifications_idempotency on idempotency_key WHERE NOT NULL)
     * guarantees this notification is sent AT MOST ONCE, ever. A duplicate
     * insert returns 23505 and this function returns null rather than logging
     * an error — used by the weekly summary's once-per-ISO-week gate, where the
     * database, not a read-then-write check, is the arbiter.
     */
    idempotencyKey?: string;
    /**
     * ISO timestamp written to `notifications.expires_at`. OPT-IN: when omitted
     * (the default, and what every other caller in this file does) the column
     * stays NULL and the row never expires — today's behaviour, unchanged.
     *
     * Set it only for a row that RESTATES a fact on a fixed cycle under a
     * per-cycle idempotency key, per the rule in
     * supabase/migrations/20260816040000_notification_expiry_director_categories.sql:
     * expiring such a row hides nothing, because the next cycle restates it and
     * the real work lives on a page. A row that is the ONLY record of a specific
     * un-actioned item must NOT get one.
     *
     * Honoured by liveNotificationOrFilter() in the bell / inbox / rollup read
     * path; admin/manage/stats reads deliberately still show lapsed rows.
     */
    expiresAt?: string;
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
  if (opts.idempotencyKey) row.idempotency_key = opts.idempotencyKey;
  if (opts.expiresAt) row.expires_at = opts.expiresAt;

  const { data: notif, error } = await db
    .from('notifications')
    .insert(row)
    .select('id')
    .single();

  if (error || !notif) {
    // 23505 on an idempotency key is the expected "already sent" outcome, not
    // a failure — do not log it as one.
    if (opts.idempotencyKey && (error as any)?.code === '23505') return null;
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

  // Director decision 2026-07-28 #6 — the EAO is copied on attendance alerts in
  // ADDITION to the Principal, so they can help the college act. Resolved once
  // per run, by role. They are NOT added to notified_profile_ids: that array is
  // "who must answer for this breach", and it is what decides who is summoned
  // to the review meeting. The EAO is informed, not summoned.
  const eaoIds = await getExecutiveAdminOfficerIds(db);

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
          recipientIds: [...new Set([...recipientIds, ...eaoIds])],
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

  // Director decision 2026-07-28 #6 — EAO copied on data-gap alerts too. A data
  // gap is very often "the college's leave calendar is out of date", which is
  // exactly the thing the EAO is being asked to help fix.
  const eaoIds = await getExecutiveAdminOfficerIds(db);

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
          recipientIds: [...new Set([...recipientIds, ...eaoIds])],
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
  /** Nudged once because the explanation window was about to close. */
  reminded: number;
  escalated: number;
  errors: string[];
}

/**
 * Resolve super-admin profile ids (the Director's reach for routing).
 *
 * DETERMINISM (review fix #3). Prod has 14 super-admins and this used to be an
 * un-ordered `.limit(10)`. Postgres row order is unspecified and shifts after
 * any UPDATE/VACUUM, so *which* 10 got the bell — and, worse, which one landed
 * at index [0] and became the HOST of every auto-booked attendance meeting —
 * could silently change between two runs an hour apart.
 *
 * Order is now `created_at ASC, id ASC`:
 *   - created_at ASC keeps the set STABLE as new super-admins are added (a new
 *     admin joins the tail, it never re-shuffles who is already in the list);
 *   - id ASC is the tie-break for two admins created in the same microsecond,
 *     chosen because it is total, immutable and independent of row storage.
 * The cap stays at 10 — a deliberate fan-out limit on Director-level bells, not
 * an accident — but it is now a documented "the 10 longest-standing
 * super-admins", not "whichever 10 the planner returned".
 * Inactive profiles are excluded: a de-activated admin should not be summoned.
 */
const SUPER_ADMIN_FANOUT_CAP = 10;

export async function getSuperAdminIds(db: SupabaseClient): Promise<string[]> {
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(SUPER_ADMIN_FANOUT_CAP);
  return (data ?? []).map((r: any) => r.id).filter(Boolean);
}

/**
 * The profile that HOSTS an auto-booked attendance review meeting when the
 * breach event carries no judge of its own.
 *
 * `getSuperAdminIds()[0]` alone is deterministic but not *meaningful*: ordered
 * by created_at the first row on prod today is the oldest super-admin account,
 * which is not necessarily anyone who could host a meeting. A host with no
 * Google Calendar connection also guarantees the meeting is never booked at all
 * (decision #4 blocks on any unconnected participant), so connection health is
 * a load-bearing property of this choice, not a cosmetic one.
 *
 * Resolution order, documented so it is auditable:
 *   1. active super-admins with an ACTIVE Google Calendar connection, then
 *   2. all other active super-admins,
 *   both in the same `created_at ASC, id ASC` order as above.
 * Returns null when there are no active super-admins at all.
 */
async function resolveMeetingHostId(
  db: SupabaseClient,
  adminIds: string[]
): Promise<string | null> {
  if (adminIds.length === 0) return null;
  const { data: conns } = await db
    .from('meeting_host_google_connections')
    .select('host_profile_id, status')
    .in('host_profile_id', adminIds)
    .eq('status', 'active');
  const connected = new Set(
    ((conns ?? []) as any[]).map((c) => c.host_profile_id).filter(Boolean)
  );
  return adminIds.find((id) => connected.has(id)) ?? adminIds[0];
}

/**
 * The Executive Admin Officer — Director decision 2026-07-28 #6: the EAO is
 * informed IN ADDITION TO the Principal on attendance / data-gap alerts and on
 * the weekly "connect your calendar" summary, so they can help the college
 * activate and update its calendars.
 *
 * Resolved BY ROLE so it survives the person changing. The email lookup is only
 * a fallback for the case where the role has not been assigned yet — resolving
 * by a hardcoded uuid or email as the primary path would silently keep paging a
 * person who left. Returns [] when nobody holds the role and the fallback
 * address does not exist, and the callers then simply do not widen the audience.
 *
 * NOT applied to the project-accountability (RACI) path — that audience is
 * defined by the task's own Responsible/Accountable/Consulted/Informed.
 */
const EAO_ROLE = 'executive_admin_officer';
const EAO_FALLBACK_EMAIL = 'eao@jkkn.ac.in';

async function getExecutiveAdminOfficerIds(
  db: SupabaseClient
): Promise<string[]> {
  const { data: byRole } = await db
    .from('profiles')
    .select('id')
    .eq('role', EAO_ROLE)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const ids = (byRole ?? []).map((r: any) => r.id).filter(Boolean);
  if (ids.length > 0) return ids;

  const { data: byEmail } = await db
    .from('profiles')
    .select('id')
    .eq('email', EAO_FALLBACK_EMAIL)
    .eq('is_active', true)
    .order('id', { ascending: true })
    .limit(1);
  return (byEmail ?? []).map((r: any) => r.id).filter(Boolean);
}

/** The standing project that holds cross-college operational follow-ups. */
const CAMPUS_OPS_PROJECT_CODE = 'CAMPUS-OPS';

/**
 * profile_id → staff.id. The Projects module keys on staff, the meetings engine
 * on profiles; `staff.profile_id` is the ONLY correct bridge. Matching on email
 * is wrong and quietly lossy — measured 2026-07-30, email matched 5 of 10
 * principals while staff.profile_id matched all 10.
 */
async function mapProfilesToStaff(
  db: SupabaseClient,
  profileIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const ids = [...new Set(profileIds.filter(Boolean))] as string[];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await db
    .from('staff')
    .select('id, profile_id, is_active')
    .in('profile_id', ids);
  for (const r of (data ?? []) as any[]) {
    if (r.profile_id && r.is_active && !map.has(r.profile_id)) {
      map.set(r.profile_id, r.id);
    }
  }
  return map;
}

/**
 * Raise a follow-up task in the standing Campus Operations project.
 *
 * Director decisions 2026-07-30: chase-ups are a REAL task (not only a bell), in
 * ONE standing project rather than one per college, carrying RACI — the EAO is
 * Accountable, the college's Principal is Consulted.
 *
 * Fails soft on purpose. The Projects module has never been used in anger
 * (0 tasks on prod at time of writing), so a schema or permissions surprise here
 * must NOT take down the accountability loop that already works. Every path
 * returns null instead of throwing, and the caller still sends its bell.
 *
 * Decision #7 — "let it queue": when there is no active EAO the task is still
 * CREATED, just unassigned. Queuing means waiting for somebody, never silently
 * dropping the work.
 */
async function createCampusOpsTask(
  db: SupabaseClient,
  opts: {
    title: string;
    description: string;
    /** The EAO — Accountable. Null when the post is vacant (task still created). */
    accountableProfileId?: string | null;
    /** The college's principal(s) — Consulted. */
    consultedProfileIds?: string[];
    /** Days from today for the due date. */
    dueInDays?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<string | null> {
  try {
    const { data: project } = await db
      .from('projects')
      .select('id')
      .eq('code', CAMPUS_OPS_PROJECT_CODE)
      .maybeSingle();
    if (!project?.id) {
      console.warn(
        `[meeting-trigger] ${CAMPUS_OPS_PROJECT_CODE} project not found — skipping task creation`
      );
      return null;
    }

    const consulted = opts.consultedProfileIds ?? [];
    const staffByProfile = await mapProfilesToStaff(db, [
      opts.accountableProfileId,
      ...consulted
    ]);
    const accountableStaffId = opts.accountableProfileId
      ? staffByProfile.get(opts.accountableProfileId) ?? null
      : null;

    const dueDate = opts.dueInDays
      ? new Date(Date.now() + opts.dueInDays * 86_400_000).toISOString().slice(0, 10)
      : null;

    const { data: task, error: taskError } = await db
      .from('project_tasks')
      .insert({
        project_id: project.id,
        title: opts.title.slice(0, 300),
        description: opts.description,
        task_type: 'task',
        status_key: 'todo',
        owner_staff_id: accountableStaffId,
        due_date: dueDate,
        metadata: { ...(opts.metadata ?? {}), source: 'meetings:accountability-engine' }
      })
      .select('id')
      .single();

    if (taskError || !task?.id) {
      console.error('[meeting-trigger] campus-ops task insert failed:', taskError?.message);
      return null;
    }

    // RACI. Rows are best-effort: a task with no assignee is still a visible,
    // actionable task, whereas throwing here would lose it entirely.
    const rows: Array<{ task_id: string; staff_id: string; role: string }> = [];
    if (accountableStaffId) {
      rows.push({ task_id: task.id, staff_id: accountableStaffId, role: 'accountable' });
    }
    for (const pid of consulted) {
      const sid = staffByProfile.get(pid);
      if (sid && sid !== accountableStaffId) {
        rows.push({ task_id: task.id, staff_id: sid, role: 'consulted' });
      }
    }
    if (rows.length > 0) {
      const { error: assigneeError } = await db.from('project_task_assignees').insert(rows);
      if (assigneeError) {
        console.error(
          '[meeting-trigger] campus-ops assignees failed:',
          assigneeError.message
        );
      }
    }

    return task.id as string;
  } catch (e: any) {
    console.error('[meeting-trigger] createCampusOpsTask threw:', e?.message ?? e);
    return null;
  }
}

/**
 * Does this explanation amount to "that day was not a working day for us"?
 *
 * Director decision 2026-07-28: JKKN does NOT encode recurring weekly holidays
 * in code — colleges record their off-days in the leave calendar, and the
 * attendance engine already honours APPROVED `institution_leaves`. The gap was
 * that a principal's reply saying exactly that went nowhere, so the identical
 * false alert fired again the following week. This is the detector that turns
 * such a reply into a task for the EAO to file the off-day.
 *
 * Deliberately conservative: a miss simply means no task is raised (the
 * explanation is still recorded and still routed to the Director as before),
 * whereas a false positive would ask the EAO to mark a real teaching day as a
 * holiday. The EAO is a human check on that either way.
 */
function looksLikeOffDayClaim(text: string): boolean {
  const t = (text ?? '').toLowerCase();
  return /\b(off[- ]?day|holiday|holidays|non[- ]?working|not a working day|no class(es)?|no working|leave day|vacation|closed)\b/.test(
    t
  );
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
  const result: ReconcileResult = { explained: 0, reminded: 0, escalated: 0, errors: [] };

  const { data: events, error } = await db
    .from('meeting_trigger_events')
    .select(
      'id, rule_id, institution_id, metric_key, observed_value, threshold, breach_date, notification_id, explanation_deadline, status, notified_profile_ids'
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
  // The EAO is Accountable for the off-day follow-ups raised below.
  const eaoIds = await getExecutiveAdminOfficerIds(db);

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
          // The reply says "that day was not a working day for us" → close the
          // loop. Without this the SAME false alert fires again next week: the
          // engine honours only APPROVED institution_leaves, and nothing was
          // turning a principal's answer into a calendar entry. Measured
          // 2026-07-30: Arts & Science had filed and approved its Saturdays and
          // correctly fired nothing, while Nursing (filed but left pending) and
          // Allied Health (never filed) would both false-fire.
          if (looksLikeOffDayClaim(r.text_response)) {
            const instName = await getInstitutionName(db, ev.institution_id);
            const { recipientIds: principalIds } = ev.institution_id
              ? await resolveRecipients(db, ev.institution_id)
              : { recipientIds: [] as string[] };

            const taskId = await createCampusOpsTask(db, {
              title: `Add ${ev.breach_date} to ${instName}'s leave calendar`,
              description:
                `${instName} was flagged on ${ev.breach_date} and the reply was:\n\n` +
                `"${r.text_response}"\n\n` +
                `If that day was genuinely an off-day, add it to the college's leave ` +
                `calendar and APPROVE it. The attendance engine only honours approved ` +
                `entries, so an unapproved one still raises the same alert next time.`,
              accountableProfileId: eaoIds[0] ?? null,
              consultedProfileIds: principalIds,
              dueInDays: 7,
              metadata: {
                event_id: ev.id,
                institution_id: ev.institution_id,
                breach_date: ev.breach_date,
                kind: 'off_day_claim'
              }
            });

            // Bell as well as task (Director decision 2026-07-30 #1): the
            // Projects module had 0 tasks on prod, so a task alone would sit
            // unseen. Idempotency key makes this at-most-once per event even if
            // the hourly cron reconciles the same row twice.
            if (eaoIds.length > 0) {
              await createBellNotification(db, {
                recipientIds: eaoIds,
                createdBy: eaoIds[0],
                title: `Off-day to file — ${instName}`,
                body:
                  `${instName} says ${ev.breach_date} was not a working day:\n\n` +
                  `"${r.text_response}"\n\n` +
                  `Please add it to their leave calendar and approve it, so the same ` +
                  `alert doesn't repeat.`,
                url: taskId ? `/projects` : '/academic/attendance',
                category: 'meetings:off-day-followup',
                idempotencyKey: `meetings:off-day-followup:${ev.id}`,
                metadata: {
                  event_id: ev.id,
                  institution_id: ev.institution_id,
                  breach_date: ev.breach_date,
                  task_id: taskId,
                  source: 'cron:meeting-trigger-reconcile'
                }
              });
            }
          }

          result.explained++;
          explained = true;
        }
      }
      if (explained) continue;

      // 2a. Deadline approaching, still no explanation → ONE reminder first.
      // Sent to the people who were actually asked, not to the Director.
      if (ev.explanation_deadline && nowISO <= ev.explanation_deadline) {
        const remindFromISO = new Date(
          new Date(ev.explanation_deadline).getTime() -
            REMINDER_BEFORE_DEADLINE_HOURS * 3_600_000
        ).toISOString();

        if (nowISO >= remindFromISO) {
          let askedIds: string[] = (ev.notified_profile_ids ?? []).filter(Boolean);
          if (askedIds.length === 0 && ev.institution_id) {
            askedIds = (await resolveRecipients(db, ev.institution_id)).recipientIds;
          }
          if (askedIds.length > 0) {
            const instName = await getInstitutionName(db, ev.institution_id);
            // At-most-once per event: a duplicate insert hits
            // idx_notifications_idempotency and returns null, so the hourly cron
            // re-reading this row cannot nag the same person repeatedly.
            await createBellNotification(db, {
              recipientIds: askedIds,
              createdBy: askedIds[0],
              title: `Reminder — ${instName} attendance note due soon`,
              body:
                `We still haven't had a note about ${instName} on ${ev.breach_date}. ` +
                `If we don't hear back within about ${REMINDER_BEFORE_DEADLINE_HOURS} hours, ` +
                `a short ${REVIEW_MEETING_MIN}-minute review meeting will be scheduled ` +
                `automatically. A sentence or two is enough to close this off.`,
              url: '/academic/attendance',
              category: 'attendance:breach-reminder',
              idempotencyKey: `meetings:explanation-reminder:${ev.id}`,
              metadata: {
                event_id: ev.id,
                institution_id: ev.institution_id,
                breach_date: ev.breach_date,
                source: 'cron:meeting-trigger-reconcile'
              }
            });
            result.reminded++;
          }
        }
        continue; // window still open — nothing to escalate yet
      }

      // 2b. Deadline passed with no explanation → escalate to a meeting.
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
export function todayIST(now: Date): string {
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

  // REVIEW FIX #7 — do not promise a booking the engine cannot make.
  // The booking pass refuses to force a time onto anyone whose Google Calendar
  // is not connected (decision #4), and on prod today only 19 of ~6,200 profiles
  // have a healthy connection. So "a meeting will be scheduled" is FALSE for
  // almost every Accountable person. Word it from reality: promise a booking
  // only when both people in that meeting can actually be booked right now,
  // otherwise say — accurately — that it is escalated for a review meeting.
  const willAutoBook = await canAutoBookFor(
    db,
    [b.judgeProfile, b.accountableProfile].filter(Boolean) as string[]
  );

  // Actionable explain-or-meet → the Accountable (supportive tone).
  const notificationId = await createBellNotification(db, {
    recipientIds: [b.accountableProfile],
    createdBy: createdBy ?? b.accountableProfile,
    title: `Accountability check-in — ${b.subjectLabel}`,
    body:
      `The ${b.noun} "${b.subjectLabel}" is ${b.detail}. As the Accountable ` +
      `person, could you add a brief note on what's happening and the plan to ` +
      `resolve it within ${EXPLANATION_WINDOW_HOURS} hours? Otherwise ` +
      (willAutoBook
        ? `a short ${REVIEW_MEETING_MIN}-minute meeting with your reporting ` +
          `head will be scheduled automatically at the next time you are both ` +
          `free.`
        : `this is escalated to your reporting head for a review meeting.`),
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
        // Deterministic truncation (review fix #3 sweep): with no ORDER BY,
        // WHICH 500 overdue tasks the cap admitted changed run to run, so a
        // task past the cap could be flagged on one run and silently skipped
        // the next. Oldest due date first = the most overdue are never dropped.
        .order('due_date', { ascending: true })
        .order('id', { ascending: true })
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
          // Same determinism fix: a stable window, not "whichever 500".
          .order('id', { ascending: true })
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
  const result: ReconcileResult = { explained: 0, reminded: 0, escalated: 0, errors: [] };

  const { data: events, error } = await db
    .from('meeting_trigger_events')
    .select(
      'id, subject_type, subject_id, subject_label, observed_value, threshold, breach_date, notification_id, explanation_deadline, status, judge_profile_id'
    )
    .eq('status', 'notified')
    .not('subject_id', 'is', null)
    // 2026-08-05 — the Director's-Desk chase engine writes 'handover' events to
    // this same ledger, and they are reconciled by
    // reconcileHandoverExplanations() in handover-chase-service, NOT here.
    // Two reasons this filter is load-bearing rather than tidy:
    //   1. a handover explanation is a progress note in director_handover_audit
    //      (fn_director_handover_progress), not an action_responses row, so this
    //      function would never find one and would escalate every handover to a
    //      meeting at the 24h mark no matter how diligently the person answered;
    //   2. the copy here says "the Accountable person" and points at /projects,
    //      which is wrong for someone who was handed a page.
    // Written as an .or() rather than .neq() on purpose: `subject_type <>
    // 'handover'` evaluates to NULL — i.e. excluded — for a row whose
    // subject_type is NULL, which would silently drop legacy rows this function
    // handles today.
    .or('subject_type.is.null,subject_type.neq.handover');
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
    // Tie-break so two events written in the same transaction do not swap
    // places between two loads of the console (review fix #3 sweep).
    .order('id', { ascending: false })
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
// event pending and ask the un-connected participant(s) to connect.
//
// REVIEW ROUND 2 (2026-07-28) — the Director decided auto-booking DOES go live
// once the duplicate risk is closed, so this pass is now written for a world
// where it actually runs:
//
//   * CRASH SAFETY. The order is CLAIM -> BOOK -> ATTACH -> (then the slow
//     external Google call). Claiming is one atomic conditional UPDATE, so only
//     one worker can own an event; the booking row carries a durable
//     trigger_dedupe_key under a UNIQUE index, so even a worker that dies
//     between BOOK and ATTACH cannot cause a second meeting on retry.
//   * ATTENDEE DOUBLE-BOOKING. mb_no_double_booking is keyed on host_profile_id
//     only, and auto-booked meetings put the Principal in the ATTENDEE slot.
//     Availability now counts a person's attendee-side bookings as busy, and a
//     scoped EXCLUDE constraint backs it at the DB level.
//   * NO PARALLEL SLOT ENGINE. Slots come from the platform's existing
//     native-slot-engine (computeSlots + intersectCollectiveSlots) driven by
//     each participant's REAL meeting_host_schedules windows and per-date
//     overrides — not from a hand-rolled 10:00-17:00 loop that could put a
//     meeting outside a host's actual availability.

/** Decision #3: a short accountability review, not an hour-long meeting. */
const REVIEW_MEETING_MIN = 30;
/** Decision #10: take the soonest slot that works — even a week or two out. */
const BOOKING_HORIZON_DAYS = 14;
/**
 * Fallback working window (campus wall clock) for a participant who has NO
 * availability schedule of their own. Anyone who does have one is scheduled
 * from their real windows instead — see loadParticipantSchedules.
 */
const DEFAULT_WORK_DAY_START_MIN = 10 * 60;
const DEFAULT_WORK_DAY_END_MIN = 17 * 60;
/** Never book something starting inside the next two hours. */
const BOOKING_MIN_NOTICE_MIN = 120;
const CAMPUS_TZ = 'Asia/Kolkata';
/** Where an un-connected participant goes to connect Google Calendar. */
const CONNECT_CALENDAR_URL = '/meetings/availability';
/** 1.5x the daily re-nudge cycle — see the expiresAt note at the fanout. */
const CONNECT_NUDGE_TTL_MS = Math.round(24 * 3600_000 * 1.5);
/** Free slots to try before giving up on a concurrent-booking race (23P01). */
const SLOT_ATTEMPTS = 5;
/** Bound the work of one cron pass. */
const BOOKING_BATCH_LIMIT = 50;
/**
 * How long a booking claim is honoured before another worker may take it. The
 * producer is an hourly cron with maxDuration 60s, so a claim from a crashed
 * run is always stale by the next run; 15 minutes is generous head-room, not a
 * tuning knob.
 */
const BOOKING_CLAIM_TTL_MIN = 15;
/** Bound the orphan-recovery scan (26 bookings exist on prod today). */
const ORPHAN_SCAN_LIMIT = 200;

export interface BookingResult {
  /** meeting_pending events with no booking yet, seen this run. */
  pending_events: number;
  /** events closed by recovering a booking a crashed earlier run had created. */
  reattached_events: number;
  /** folded meetings considered (decision #9: same people + same day = one). */
  groups: number;
  /** meetings actually booked. */
  booked: number;
  /** groups that re-used an existing booking via the idempotency key. */
  deduped: number;
  /** breach events closed by those bookings. */
  events_booked: number;
  /** people asked to connect their calendar (decision #4). */
  calendar_nudges: number;
  /** groups left pending because someone has no healthy calendar. */
  skipped_no_connection: number;
  /** groups left pending because no common free slot exists in the horizon. */
  skipped_no_slot: number;
  /** events with nobody to invite (no recipient, no judge). */
  skipped_no_participants: number;
  /** groups left pending because Google could not be read (fail closed). */
  skipped_calendar_error: number;
  /** groups another worker already owned (claim lost). */
  skipped_claimed: number;
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
  booking_claimed_at: string | null;
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

/**
 * Is the engine actually able to book a meeting for these people right now?
 * Every participant needs a healthy Google Calendar connection (decision #4
 * refuses to put a time on an un-connected person's day). Used to keep the
 * notification copy honest — see review fix #7.
 */
export async function canAutoBookFor(
  db: SupabaseClient,
  profileIds: string[]
): Promise<boolean> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (ids.length === 0) return false;
  const { data, error } = await db
    .from('meeting_host_google_connections')
    .select('host_profile_id')
    .in('host_profile_id', ids)
    .eq('status', 'active');
  if (error) return false;
  const connected = new Set(
    ((data ?? []) as any[]).map((c) => c.host_profile_id).filter(Boolean)
  );
  return ids.every((id) => connected.has(id));
}

/**
 * The meeting's durable identity, hashed. Derived from
 * (institution, breach date, the sorted participant set) — deliberately NOT
 * from the set of breach events folded into it, because that set can grow
 * between two runs. Anchoring on identity is what makes a post-crash retry
 * collide with the row it already wrote instead of writing a second meeting.
 */
function triggerDedupeKey(
  institutionId: string | null,
  breachDate: string,
  participantIds: string[]
): string {
  const canonical = `v1|${institutionId ?? 'none'}|${breachDate}|${[
    ...participantIds
  ]
    .sort()
    .join(',')}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ---------------------------------------------------------------------------
// Availability — reuse the platform's slot engine (review fix #4)
// ---------------------------------------------------------------------------

interface ParticipantSchedule {
  timezone: string;
  windows: EngineWindow[];
  overrides: EngineOverride[];
  /** 'own' = the person's real schedule; 'default' = campus fallback. */
  origin: 'own' | 'default';
}

/**
 * Snap a window to the review-meeting grid so every participant's candidate
 * starts land on the same instants. computeSlots steps from each window's own
 * start_minute, so a host whose day starts at 09:15 would generate 09:15/09:45…
 * and never intersect a host starting at 09:00 — the meeting would look
 * impossible when both are free. Rounding the start UP and the end DOWN keeps
 * every candidate strictly inside the person's real availability.
 *
 * This is a real condition, not a hypothetical: 24 of the 1,460 live windows on
 * prod start on a non-:00/:30 minute (e.g. 560 = 09:20, 1065 = 17:45).
 *
 * The cost is that a window too short to hold a grid-aligned 30-minute meeting
 * (1065-1095 = 17:45-18:15) yields nothing. That is correct — we would rather
 * offer no slot than one two people cannot both attend — but the CALLER must
 * treat "all my windows died" as "no availability", not as "no schedule", which
 * is why loadParticipantSchedules distinguishes the two below.
 */
function snapWindow(
  startMinute: number,
  endMinute: number
): { startMinute: number; endMinute: number } | null {
  const step = REVIEW_MEETING_MIN;
  const start = Math.ceil(startMinute / step) * step;
  const end = Math.floor(endMinute / step) * step;
  if (end - start < REVIEW_MEETING_MIN) return null;
  return { startMinute: start, endMinute: end };
}

/** Campus fallback: Mon-Sat 10:00-17:00, Sunday closed. */
function defaultSchedule(): ParticipantSchedule {
  const windows: EngineWindow[] = [];
  for (let weekday = 1; weekday <= 6; weekday++) {
    windows.push({
      weekday,
      startMinute: DEFAULT_WORK_DAY_START_MIN,
      endMinute: DEFAULT_WORK_DAY_END_MIN
    });
  }
  return { timezone: CAMPUS_TZ, windows, overrides: [], origin: 'default' };
}

/**
 * Each participant's REAL bookable windows, from the same tables the public
 * booking widget reads (meeting_host_schedules -> meeting_schedule_windows /
 * meeting_schedule_overrides). A person with no schedule row falls back to the
 * campus default rather than being un-bookable.
 *
 * 266 schedules with 1,460 windows exist on prod (2026-07-28), so this is real
 * data, not a theoretical path: hand-rolling 10:00-17:00 would book people
 * outside their stated availability.
 */
async function loadParticipantSchedules(
  db: SupabaseClient,
  profileIds: string[],
  fromDate: string,
  toDate: string
): Promise<Map<string, ParticipantSchedule>> {
  const out = new Map<string, ParticipantSchedule>();
  if (profileIds.length === 0) return out;

  const { data: schedules } = await db
    .from('meeting_host_schedules')
    .select('id, host_profile_id, timezone, is_default, created_at')
    .in('host_profile_id', profileIds)
    // Deterministic pick when a host owns several schedules: the default one,
    // then the oldest, then by id.
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  const scheduleForHost = new Map<string, { id: string; timezone: string }>();
  for (const s of ((schedules ?? []) as any[])) {
    if (!s?.host_profile_id || scheduleForHost.has(s.host_profile_id)) continue;
    scheduleForHost.set(s.host_profile_id, {
      id: s.id,
      timezone: s.timezone || CAMPUS_TZ
    });
  }

  const scheduleIds = [...scheduleForHost.values()].map((s) => s.id);
  const windowsBySchedule = new Map<string, EngineWindow[]>();
  const overridesBySchedule = new Map<string, EngineOverride[]>();
  /** Schedules that HAVE window rows, even if none survived the grid snap. */
  const schedulesWithAnyWindowRow = new Set<string>();

  if (scheduleIds.length > 0) {
    const { data: wins } = await db
      .from('meeting_schedule_windows')
      .select('schedule_id, weekday, start_minute, end_minute')
      .in('schedule_id', scheduleIds);
    for (const w of ((wins ?? []) as any[])) {
      schedulesWithAnyWindowRow.add(w.schedule_id);
      const snapped = snapWindow(Number(w.start_minute), Number(w.end_minute));
      if (!snapped) continue;
      const list = windowsBySchedule.get(w.schedule_id) ?? [];
      list.push({ weekday: Number(w.weekday), ...snapped });
      windowsBySchedule.set(w.schedule_id, list);
    }

    const { data: ovs } = await db
      .from('meeting_schedule_overrides')
      .select('schedule_id, date, start_minute, end_minute')
      .in('schedule_id', scheduleIds)
      .gte('date', fromDate)
      .lte('date', toDate);
    for (const o of ((ovs ?? []) as any[])) {
      const list = overridesBySchedule.get(o.schedule_id) ?? [];
      if (o.start_minute == null || o.end_minute == null) {
        // null/null closes the day outright — the engine's own convention.
        list.push({ date: o.date, startMinute: null, endMinute: null });
      } else {
        const snapped = snapWindow(Number(o.start_minute), Number(o.end_minute));
        list.push(
          snapped
            ? { date: o.date, startMinute: snapped.startMinute, endMinute: snapped.endMinute }
            : { date: o.date, startMinute: null, endMinute: null }
        );
      }
      overridesBySchedule.set(o.schedule_id, list);
    }
  }

  for (const pid of profileIds) {
    const sched = scheduleForHost.get(pid);
    // The campus default is for people who have said NOTHING about when they
    // are available. It must NOT be substituted for someone who HAS a schedule
    // whose windows are all too short/off-grid to hold a 30-minute meeting —
    // that person has stated availability and we would be booking outside it.
    // One live schedule on prod (5 windows, all 30 minutes at :45 boundaries)
    // is exactly this case; it now yields no slots instead of a fake 10:00.
    const hasScheduleRows = !!sched && schedulesWithAnyWindowRow.has(sched.id);
    if (!sched || !hasScheduleRows) {
      out.set(pid, defaultSchedule());
      continue;
    }
    out.set(pid, {
      timezone: sched.timezone,
      windows: windowsBySchedule.get(sched.id) ?? [],
      overrides: overridesBySchedule.get(sched.id) ?? [],
      origin: 'own'
    });
  }
  return out;
}

/**
 * Everything that makes each participant busy in the booking horizon:
 *   - their Google calendar (fail CLOSED — never guess at availability);
 *   - confirmed meeting_bookings where they are the HOST;
 *   - confirmed meeting_bookings where they are the ATTENDEE  <-- review fix #2.
 *
 * The attendee leg is the whole point of the fix: mb_no_double_booking only
 * protects the host, so without this the engine would happily hand the same
 * Principal two overlapping review meetings.
 */
async function loadBusyByPerson(
  db: SupabaseClient,
  profileIds: string[],
  windowStartIso: string,
  windowEndIso: string,
  errors: string[]
): Promise<{ busy: Map<string, Interval[]>; calendarFailed: boolean }> {
  const busy = new Map<string, Interval[]>();
  for (const pid of profileIds) busy.set(pid, []);
  let calendarFailed = false;

  const push = (pid: string, startRaw: string, endRaw: string) => {
    const s = Date.parse(startRaw);
    const e = Date.parse(endRaw);
    if (Number.isFinite(s) && Number.isFinite(e)) {
      busy.get(pid)?.push({ start: s, end: e });
    }
  };

  for (const pid of profileIds) {
    try {
      const res = await GoogleCalendarService.busyForHost(
        db,
        pid,
        windowStartIso,
        windowEndIso
      );
      if (res.status === 'ok') {
        for (const b of res.busy) push(pid, b.start, b.end);
      } else {
        // 'failed' (Google error) or 'none' (connection vanished between the
        // health check and now) — never guess at someone's availability.
        calendarFailed = true;
      }
    } catch (e: any) {
      calendarFailed = true;
      errors.push(`freeBusy ${pid}: ${e?.message ?? String(e)}`);
    }
  }

  // JKKN-side bookings count too: one that never reached Google (or predates
  // the connection) must still block.
  const { data: asHost } = await db
    .from('meeting_bookings')
    .select('host_profile_id, start_time, end_time')
    .in('host_profile_id', profileIds)
    .eq('status', 'confirmed')
    .lt('start_time', windowEndIso)
    .gt('end_time', windowStartIso);
  for (const b of ((asHost ?? []) as any[])) {
    push(b.host_profile_id, b.start_time, b.end_time);
  }

  const { data: asAttendee } = await db
    .from('meeting_bookings')
    .select('attendee_profile_id, start_time, end_time')
    .in('attendee_profile_id', profileIds)
    .eq('status', 'confirmed')
    .lt('start_time', windowEndIso)
    .gt('end_time', windowStartIso);
  for (const b of ((asAttendee ?? []) as any[])) {
    if (b.attendee_profile_id) {
      push(b.attendee_profile_id, b.start_time, b.end_time);
    }
  }

  return { busy, calendarFailed };
}

/**
 * The soonest instants EVERY participant can make, using each person's own
 * schedule. computeSlots does the per-person work (windows, per-date overrides,
 * buffers, minimum notice, timezone) and intersectCollectiveSlots does the
 * "everyone must be free" part — both are the platform's existing engine, not a
 * re-implementation.
 */
function commonFreeSlots(
  participantIds: string[],
  schedules: Map<string, ParticipantSchedule>,
  busy: Map<string, Interval[]>,
  now: Date,
  fromDate: string,
  toDate: string
): Slot[] {
  const perPerson: Slot[][] = participantIds.map((pid) => {
    const sched = schedules.get(pid) ?? defaultSchedule();
    return computeSlots({
      timezone: sched.timezone,
      durationMin: REVIEW_MEETING_MIN,
      slotIntervalMin: REVIEW_MEETING_MIN,
      windows: sched.windows,
      overrides: sched.overrides,
      bookings: (busy.get(pid) ?? []).map((b) => ({
        start: new Date(b.start),
        end: new Date(b.end)
      })),
      minNoticeMin: BOOKING_MIN_NOTICE_MIN,
      fromDate,
      toDate,
      now
    });
  });
  return intersectCollectiveSlots(perPerson);
}

// ---------------------------------------------------------------------------
// Bookkeeping helpers
// ---------------------------------------------------------------------------

/** Stamp a non-fatal reason on every event in a group, without hourly churn. */
async function recordBookingError(
  db: SupabaseClient,
  events: PendingEvent[],
  message: string
): Promise<void> {
  const stale = events.filter((e) => e.booking_error !== message);
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
 * Decision #4 degrade path. Ask the un-connected participant(s) to connect
 * Google Calendar and leave the breach at meeting_pending so the next run books
 * it the moment they do.
 *
 * DIRECTOR DECISION 2026-07-28 #5: this ask is now sent EVERY time a booking is
 * blocked, not once per event — the previous once-per-person suppression was
 * removed deliberately. Be clear-eyed about the volume that buys: the producer
 * is the HOURLY reconcile cron, so an un-connected person with one unbooked
 * breach receives up to 24 of these bells a day until they connect (or until
 * the breach is dismissed). That is the intended pressure, and it is also the
 * reason the weekly summary below goes to the Principal and the EAO instead of
 * copying them on every single nudge.
 */
async function nudgeToConnectCalendar(
  db: SupabaseClient,
  group: BookingGroup,
  unconnected: string[],
  adminIds: string[],
  now: Date
): Promise<number> {
  if (unconnected.length === 0) return 0;

  const instName = group.institutionId
    ? await getInstitutionName(db, group.institutionId)
    : 'JKKN';
  const subject = group.events[0]?.subject_label ?? instName;

  // Decision #5 was "nudge EVERY time a booking is blocked". Taken literally that
  // is once per reconcile pass — and the producer is the HOURLY cron, so a single
  // unbooked breach would emit up to 24 bells/person/day. A channel that noisy is
  // muted within a day, which defeats the whole point (the nudge exists to drive
  // Google-Calendar adoption, currently 21 of ~7,000). So the pressure is kept —
  // it re-fires for every NEW day the breach stays unbooked, and for every new
  // group — but is capped at ONE bell per group per campus day.
  //
  // The cap is enforced by the DB, not by a code check: idempotency_key carries a
  // partial UNIQUE index (idx_notifications_idempotency ... WHERE idempotency_key
  // IS NOT NULL), and createBellNotification treats the resulting 23505 as the
  // expected "already sent" outcome and returns null. Two concurrent cron runs
  // therefore cannot both send.
  const nudgeKey =
    `meetings:calendar-connect-needed:${todayIST(now)}:` +
    `${group.institutionId ?? 'global'}:${group.breachDate}`;

  const notificationId = await createBellNotification(db, {
    recipientIds: unconnected,
    createdBy: adminIds[0] ?? unconnected[0],
    title: 'Connect your Google Calendar so this review meeting can be scheduled',
    body:
      `A short review meeting about ${subject} (${group.breachDate}) is waiting ` +
      `to be scheduled, but your Google Calendar is not connected — so we cannot ` +
      `see when you are free and will not put a time on your day without it. ` +
      `Open Meetings → Availability and connect Google Calendar; as soon as ` +
      `everyone in the meeting is connected it is booked automatically at the ` +
      `soonest ${REVIEW_MEETING_MIN}-minute slot you all share.`,
    url: CONNECT_CALENDAR_URL,
    category: 'meetings:calendar-connect-needed',
    idempotencyKey: nudgeKey,
    // 2026-08-10 expiry: this row is re-emitted for every NEW day the breach
    // stays unbooked (see the cap above), so it is a daily restatement, not the
    // only record of the breach — the breach itself lives on
    // meeting_trigger_events and surfaces in Meetings. Without a TTL, 47 of
    // these accumulated unexpired in 14 days and never left anyone's bell.
    // TTL = 1.5x the daily cadence, the same margin and the same reasoning as
    // 20260816040000: 24h would kill the row at the moment its replacement is
    // due, so any slip empties the bell. A literal is safe here (unlike the
    // dispatcher-run routines) because this producer's cadence is pinned in
    // vercel.json ('23 * * * *'), so a cadence change ships in the same deploy.
    expiresAt: new Date(now.getTime() + CONNECT_NUDGE_TTL_MS).toISOString(),
    metadata: {
      event_ids: group.events.map((e) => e.id),
      institution_id: group.institutionId,
      breach_date: group.breachDate,
      unconnected_profile_ids: unconnected,
      source: 'cron:meeting-trigger-reconcile'
    }
  });

  // Already nudged for this group today — nothing was sent, so do not count it.
  if (notificationId === null) return 0;

  const alreadyNudged = new Set<string>();
  for (const ev of group.events) {
    for (const p of ev.calendar_nudged_profile_ids ?? []) alreadyNudged.add(p);
  }
  await db
    .from('meeting_trigger_events')
    .update({
      calendar_nudge_sent_at: now.toISOString(),
      // Audit trail only — no longer a suppression list (decision #5).
      calendar_nudged_profile_ids: [
        ...new Set([...alreadyNudged, ...unconnected])
      ],
      booking_error: 'waiting on a Google Calendar connection'
    })
    .in(
      'id',
      group.events.map((e) => e.id)
    );

  return unconnected.length;
}

/**
 * Crash recovery (review fix #1, second layer). If an earlier run died between
 * "booking inserted" and "events flipped to booked", the booking exists but the
 * breach events are still queued — and a naive next run would book a SECOND
 * meeting. Re-attach those events to the meeting that already exists, before
 * anything is grouped.
 *
 * Cheap and bounded: only this engine's own bookings, newest first, capped.
 */
async function reattachOrphanBookings(
  db: SupabaseClient,
  pending: PendingEvent[],
  errors: string[]
): Promise<Set<string>> {
  const attached = new Set<string>();
  if (pending.length === 0) return attached;

  const pendingIds = new Set(pending.map((e) => e.id));
  const { data: bookings, error } = await db
    .from('meeting_bookings')
    .select('id, answers')
    .eq('source', 'trigger-engine')
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(ORPHAN_SCAN_LIMIT);
  if (error) {
    errors.push(`orphan scan: ${error.message}`);
    return attached;
  }

  for (const b of ((bookings ?? []) as any[])) {
    const refs: string[] = Array.isArray(b?.answers?.trigger_event_ids)
      ? b.answers.trigger_event_ids
      : [];
    const orphans = refs.filter((id) => pendingIds.has(id) && !attached.has(id));
    if (orphans.length === 0) continue;

    const { data: fixed, error: upErr } = await db
      .from('meeting_trigger_events')
      .update({
        status: 'booked',
        booking_id: b.id,
        booking_error: null,
        booking_claimed_at: null,
        booking_claim_token: null
      })
      .in('id', orphans)
      .is('booking_id', null)
      .select('id');
    if (upErr) {
      errors.push(`orphan reattach ${b.id}: ${upErr.message}`);
      continue;
    }
    for (const r of ((fixed ?? []) as any[])) attached.add(r.id);
  }
  return attached;
}

/**
 * Book the meetings the engine already decided are warranted.
 *
 * Runs after reconcileExplanations in the hourly cron. For every
 * status='meeting_pending' event with no booking yet:
 *   0. recover any booking a crashed earlier run created but never attached;
 *   1. resolve who must be in the room — the notified owner(s) (Principal /
 *      alert owner / Accountable) plus the judge (Director / super-admin);
 *   2. fold same-day breaches for the same people at the same institution into
 *      ONE meeting (#9);
 *   3. if EVERY participant has a healthy Google connection, take the soonest
 *      slot they ALL have free according to their own availability schedules
 *      (#3, #10, #11): claim the events, write the meeting_bookings row under
 *      its idempotency key, flip the events to 'booked', and only THEN make the
 *      slow external Google call;
 *   4. otherwise DO NOT book (#4) — ask the un-connected participant(s) to
 *      connect and leave the events pending.
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
    reattached_events: 0,
    groups: 0,
    booked: 0,
    deduped: 0,
    events_booked: 0,
    calendar_nudges: 0,
    skipped_no_connection: 0,
    skipped_no_slot: 0,
    skipped_no_participants: 0,
    skipped_calendar_error: 0,
    skipped_claimed: 0,
    errors: []
  };

  const { data: events, error } = await db
    .from('meeting_trigger_events')
    .select(
      'id, institution_id, metric_key, observed_value, threshold, breach_date, subject_type, subject_label, judge_profile_id, notified_profile_ids, calendar_nudged_profile_ids, booking_error, booking_claimed_at'
    )
    .eq('status', 'meeting_pending')
    .is('booking_id', null)
    .order('breach_date', { ascending: true })
    // id is the tie-break: breach_date alone is not unique, so which 50 events
    // the batch limit admitted could otherwise change between runs.
    .order('id', { ascending: true })
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

  const loaded = (events ?? []) as unknown as PendingEvent[];
  result.pending_events = loaded.length;
  // The state today: 0 events, all rules dormant. Clean no-op, no Google calls,
  // no admin lookup, nothing written.
  if (loaded.length === 0) return result;

  // --- 0. crash recovery BEFORE anything is grouped --------------------------
  const reattached = await reattachOrphanBookings(db, loaded, result.errors);
  result.reattached_events = reattached.size;
  const pending = loaded.filter((e) => !reattached.has(e.id));
  if (pending.length === 0) return result;

  const adminIds = await getSuperAdminIds(db);
  const defaultHostId = await resolveMeetingHostId(db, adminIds);

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
      // Director. defaultHostId is resolved deterministically (review fix #3) —
      // it can no longer change identity between two runs an hour apart.
      const judge = ev.judge_profile_id ?? defaultHostId ?? null;
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

      // Same INSTITUTION + same people + same breach day → one meeting.
      // The institution is part of the key (review fix #8): without it, in the
      // no-Principal fallback where every college resolves to the same
      // super-admin set, same-day breaches at N different institutions collapse
      // into ONE meeting attributed to whichever institution was seen first.
      const key = `${ev.institution_id ?? 'none'}|${ev.breach_date}|${[
        ...participantIds
      ]
        .sort()
        .join(',')}`;
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

  const fromDate = todayIST(now);
  const toDate = addDaysISO(fromDate, BOOKING_HORIZON_DAYS);

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

      // --- CLAIM FIRST (review fix #1) --------------------------------------
      // One atomic conditional UPDATE. Two workers racing the same event both
      // run this; Postgres serialises them on the row and re-evaluates the
      // predicate against the winner's new row version, so the loser matches 0
      // rows and walks away. Nothing has been created at this point, so losing
      // the claim costs nothing.
      const claimToken = crypto.randomUUID();
      const staleBefore = new Date(
        now.getTime() - BOOKING_CLAIM_TTL_MIN * 60_000
      ).toISOString();
      // Claimed through an RPC, not a PostgREST UPDATE. PostgREST re-applies the
      // request's filters to an UPDATE's RETURNING projection — and this claim
      // WRITES the very column it FILTERS on (booking_claimed_at). The new value
      // fails the staleness predicate, so the row is filtered out of its own
      // response body: the UPDATE commits, the caller gets [], concludes another
      // worker owns the row (skipped_claimed++), and the claim it just wrote
      // blocks every later run for BOOKING_CLAIM_TTL_MIN. A livelock in which
      // nothing books and nothing is reported. Reproduced on prod 2026-08-18:
      //   before 02:18:44Z (stale) -> PATCH … or=(is.null,lt.02:33:07Z) -> body []
      //   after  02:48:44Z         -> the write LANDED anyway
      // In SQL, UPDATE … RETURNING returns exactly the rows touched, so the
      // function returns the truth. Atomicity is unchanged: Postgres serialises
      // concurrent writers on the row and re-evaluates the predicate against the
      // winner's version, so the loser matches 0 rows and walks away.
      const { data: claimedRows, error: claimErr } = await db.rpc(
        'fn_meeting_claim_pending_events',
        {
          p_event_ids: group.events.map((e) => e.id),
          p_claim_token: claimToken,
          p_stale_before: staleBefore
        }
      );

      if (claimErr) {
        result.errors.push(`claim ${group.key}: ${claimErr.message}`);
        continue;
      }
      const claimedIds = new Set(
        ((claimedRows ?? []) as any[]).map((r) => r.claimed_id)
      );
      if (claimedIds.size === 0) {
        // Someone else owns every event in this group right now.
        result.skipped_claimed++;
        continue;
      }
      // Work only with what we actually own.
      const ownedEvents = group.events.filter((e) => claimedIds.has(e.id));

      // Best-effort release, used only for failures BEFORE the booking insert.
      // After the insert we deliberately leave the claim to age out: the
      // idempotency key already makes a retry safe, and holding the claim stops
      // a second worker doing redundant Google work in the meantime.
      const releaseClaim = async () => {
        await db
          .from('meeting_trigger_events')
          .update({ booking_claimed_at: null, booking_claim_token: null })
          .in('id', [...claimedIds])
          .eq('booking_claim_token', claimToken);
      };

      // --- availability: everyone's real schedule, fail CLOSED on read error -
      const windowStartIso = new Date(
        now.getTime() + BOOKING_MIN_NOTICE_MIN * 60_000
      ).toISOString();
      const windowEndIso = new Date(
        now.getTime() + (BOOKING_HORIZON_DAYS + 1) * 86_400_000
      ).toISOString();

      const { busy, calendarFailed } = await loadBusyByPerson(
        db,
        group.participantIds,
        windowStartIso,
        windowEndIso,
        result.errors
      );

      if (calendarFailed) {
        result.skipped_calendar_error++;
        await recordBookingError(
          db,
          ownedEvents,
          'Google Calendar availability could not be read; will retry next run'
        );
        await releaseClaim();
        continue;
      }

      const schedules = await loadParticipantSchedules(
        db,
        group.participantIds,
        fromDate,
        toDate
      );
      const freeSlots = commonFreeSlots(
        group.participantIds,
        schedules,
        busy,
        now,
        fromDate,
        toDate
      );
      if (freeSlots.length === 0) {
        result.skipped_no_slot++;
        await recordBookingError(
          db,
          ownedEvents,
          `no common free ${REVIEW_MEETING_MIN}-minute slot in the next ${BOOKING_HORIZON_DAYS} days that fits everyone's availability`
        );
        await releaseClaim();
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
          ownedEvents,
          'the person answering for this breach has no email on file'
        );
        await releaseClaim();
        continue;
      }

      const instName = group.institutionId
        ? await getInstitutionName(db, group.institutionId)
        : 'JKKN';
      const label = group.events[0]?.subject_label ?? instName;

      // --- insert the booking under its idempotency key ---------------------
      // 23505 on uq_meeting_bookings_trigger_dedupe_key means an earlier run
      // already created this exact meeting and died before attaching it: adopt
      // that row instead of writing a second one. 23P01 means the slot was
      // taken between the read and the write (by the host constraint OR the new
      // attendee constraint) — try the next free slot.
      const dedupeKey = triggerDedupeKey(
        group.institutionId,
        group.breachDate,
        group.participantIds
      );
      let booking:
        | { id: string; startIso: string; endIso: string; reused: boolean }
        | null = null;
      let lastErr = '';

      for (const slot of freeSlots.slice(0, SLOT_ATTEMPTS)) {
        const startIso = new Date(slot.start).toISOString();
        const endIso = new Date(
          new Date(slot.start).getTime() + REVIEW_MEETING_MIN * 60_000
        ).toISOString();
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
            trigger_dedupe_key: dedupeKey,
            answers: {
              auto_booked_by: 'meeting-trigger-engine',
              // Decision #9: every folded breach is referenced here, so the
              // meeting can always be traced back to all of its causes — and so
              // reattachOrphanBookings can find it after a crash.
              trigger_event_ids: ownedEvents.map((e) => e.id),
              breach_date: group.breachDate,
              institution_id: group.institutionId,
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
          booking = {
            id: (inserted as any).id as string,
            startIso,
            endIso,
            reused: false
          };
          break;
        }
        lastErr = insErr?.message ?? 'unknown insert error';
        const code = (insErr as any)?.code;

        if (code === '23505') {
          const { data: existing } = await (db as any)
            .from('meeting_bookings')
            .select('id, start_time, end_time')
            .eq('trigger_dedupe_key', dedupeKey)
            .eq('status', 'confirmed')
            .maybeSingle();
          if (existing) {
            booking = {
              id: (existing as any).id as string,
              startIso: (existing as any).start_time as string,
              endIso: (existing as any).end_time as string,
              reused: true
            };
            result.deduped++;
          }
          break;
        }
        // Exclusion violation → the slot went; anything else is not retryable.
        if (code !== '23P01') break;
      }

      if (!booking) {
        result.errors.push(`group ${group.key}: booking insert failed — ${lastErr}`);
        await recordBookingError(db, ownedEvents, `booking insert failed: ${lastErr}`);
        await releaseClaim();
        continue;
      }

      // --- ATTACH immediately, before any slow external call ----------------
      // This is the crash-window that used to produce duplicates. It is now two
      // back-to-back DB writes, and even that window is covered: the booking is
      // findable by reattachOrphanBookings and re-derivable by dedupe key.
      const { data: attachedRows, error: upErr } = await db
        .from('meeting_trigger_events')
        .update({
          status: 'booked',
          booking_id: booking.id,
          booking_error: null,
          booking_claimed_at: null,
          booking_claim_token: null
        })
        .in('id', [...claimedIds])
        .eq('booking_claim_token', claimToken)
        .select('id');
      if (upErr) {
        result.errors.push(`mark booked ${group.key}: ${upErr.message}`);
      }
      const attachedCount = ((attachedRows ?? []) as any[]).length;
      if (attachedCount === 0) {
        // Our claim was taken over while we were writing. The booking is safe
        // (idempotency key) and the next run's orphan recovery will attach it;
        // do NOT report this as a success, and do not bell a room that another
        // worker is about to bell.
        result.errors.push(
          `group ${group.key}: claim lost before attach — booking ${booking.id} left for the next run to adopt`
        );
        continue;
      }
      // `booked` counts meetings this run actually created; a re-used booking
      // was created by an earlier run and is counted under `deduped`.
      if (!booking.reused) result.booked++;
      result.events_booked += attachedCount;

      // When we adopted an existing booking, widen its trace so the meeting
      // still lists every breach it now closes. (A plain answers UPDATE is not
      // a lifecycle event for either meeting_bookings trigger — the webhook
      // function returns early unless status or start_time changed, and the
      // workflow trigger only fires on UPDATE OF status.)
      if (booking.reused) {
        const { data: cur } = await (db as any)
          .from('meeting_bookings')
          .select('answers')
          .eq('id', booking.id)
          .maybeSingle();
        const prevRefs: string[] = Array.isArray(
          (cur as any)?.answers?.trigger_event_ids
        )
          ? (cur as any).answers.trigger_event_ids
          : [];
        await (db as any)
          .from('meeting_bookings')
          .update({
            answers: {
              ...((cur as any)?.answers ?? {}),
              trigger_event_ids: [
                ...new Set([...prevRefs, ...ownedEvents.map((e) => e.id)])
              ]
            }
          })
          .eq('id', booking.id);
      }

      // --- Google event + Meet link (slow, external; DB is already correct) --
      let meetUrl: string | null = null;
      if (!booking.reused) {
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
              ownedEvents
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
          // The meeting exists in JKKN either way; only the calendar copy is
          // lost, and GoogleCalendarService gives us no client-supplied event
          // id, so retrying it later could create a DUPLICATE Google event.
          // We therefore do not auto-retry — the booking is real and visible in
          // JKKN, and the bell below still tells the room.
          logger.error(MODULE, 'Google event creation failed for auto-booking', e);
          result.errors.push(
            `google event for booking ${booking.id}: ${e?.message ?? String(e)}`
          );
        }
      }

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
          (ownedEvents.length > 1
            ? ` It covers ${ownedEvents.length} items from ${group.breachDate}.`
            : '') +
          (meetUrl ? ` Google Meet: ${meetUrl}` : '') +
          ` It is on your Google Calendar; reply there if you need a different time.`,
        url: '/meetings/inbox',
        category: 'meetings:trigger-meeting-booked',
        metadata: {
          booking_id: booking.id,
          event_ids: ownedEvents.map((e) => e.id),
          institution_id: group.institutionId,
          breach_date: group.breachDate,
          start_time: booking.startIso,
          reused_existing_booking: booking.reused,
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

// ---------------------------------------------------------------------------
// Weekly "who still has no calendar" summary (Director decisions #5 + #6)
// ---------------------------------------------------------------------------
// The per-blocked-booking nudge goes to the un-connected person. This is the
// other half: once a week the PRINCIPAL of each college — and the EAO, who is
// the person tasked with helping them — gets the list of people in that college
// who still have no healthy Google Calendar connection, so somebody can chase
// it rather than the engine quietly never booking anything.
//
// Deliberately NOT a new vercel.json cron: it is a weekly PATH inside the
// existing hourly reconcile cron, gated to fire once per ISO week.
//
// The gate is the DATABASE, not a read-then-write check. `notifications` already
// carries idempotency_key under a partial UNIQUE index
// (idx_notifications_idempotency ... WHERE idempotency_key IS NOT NULL), so the
// key `meetings:calendar-connect-weekly:<ISO week>:<institution>` makes a second
// send physically impossible — no extra table, no state column to drift, and no
// race between the check and the insert. A cheap indexed pre-check skips the
// work; the unique index is what actually guarantees it.
// (The obvious alternative — filtering on metadata->>'iso_week' — would be an
// unindexed containment scan over 220,289 notification rows every hour.)

const WEEKLY_SUMMARY_CATEGORY = 'meetings:calendar-connect-weekly';
/** 1.5x the weekly restatement cycle — see the expiresAt note at the fanout. */
const WEEKLY_SUMMARY_TTL_MS = Math.round(7 * 24 * 3600_000 * 1.5);

export interface WeeklyConnectSummaryResult {
  ran: boolean;
  iso_week: string;
  institutions_notified: number;
  people_unconnected: number;
  errors: string[];
}

/** ISO-8601 week label, e.g. "2026-W31". Weeks start Monday. */
function isoWeekLabel(d: Date): string {
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const dayNum = t.getUTCDay() || 7; // Sunday = 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum); // to the week's Thursday
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function sendWeeklyCalendarConnectSummary(
  opts: { now?: Date; client?: SupabaseClient; force?: boolean } = {}
): Promise<WeeklyConnectSummaryResult> {
  const db = opts.client ?? createServiceRoleClient();
  const now = opts.now ?? new Date();
  const isoWeek = isoWeekLabel(now);
  const result: WeeklyConnectSummaryResult = {
    ran: false,
    iso_week: isoWeek,
    institutions_notified: 0,
    people_unconnected: 0,
    errors: []
  };

  const weeklyKey = (institutionId: string) =>
    `${WEEKLY_SUMMARY_CATEGORY}:${isoWeek}:${institutionId}`;

  // --- cheap indexed pre-check: has ANY college's summary gone out this week?
  // This only saves the work; the unique index on idempotency_key is what makes
  // a duplicate send impossible even if two workers get past this together.
  if (!opts.force) {
    const { data: already, error: gateErr } = await db
      .from('notifications')
      .select('id')
      .like('idempotency_key', `${WEEKLY_SUMMARY_CATEGORY}:${isoWeek}:%`)
      .limit(1);
    if (gateErr) {
      result.errors.push(`weekly gate: ${gateErr.message}`);
      return result;
    }
    if ((already ?? []).length > 0) return result; // already sent this week
  }

  try {
    // Who the engine could ever need to book: anyone set up as a meeting host,
    // plus every Principal (a Principal with no schedule is still summonable —
    // the booking pass falls back to the campus default window for them).
    const { data: hostRows } = await db
      .from('meeting_host_schedules')
      .select('host_profile_id');
    const hostIds = [
      ...new Set(
        ((hostRows ?? []) as any[]).map((r) => r.host_profile_id).filter(Boolean)
      )
    ];

    const people = new Map<
      string,
      { id: string; name: string; institutionId: string | null; role: string | null }
    >();
    const collect = (rows: any[]) => {
      for (const p of rows) {
        if (!p?.id || people.has(p.id)) continue;
        people.set(p.id, {
          id: p.id,
          name: p.full_name || p.email || 'Unnamed',
          institutionId: p.institution_id ?? null,
          role: p.role ?? null
        });
      }
    };

    if (hostIds.length > 0) {
      const { data: hostProfiles } = await db
        .from('profiles')
        .select('id, full_name, email, role, institution_id')
        .in('id', hostIds)
        .eq('is_active', true);
      collect((hostProfiles ?? []) as any[]);
    }
    const { data: principalProfiles } = await db
      .from('profiles')
      .select('id, full_name, email, role, institution_id')
      .eq('role', 'principal')
      .eq('is_active', true);
    collect((principalProfiles ?? []) as any[]);

    const allIds = [...people.keys()];
    if (allIds.length === 0) return result;

    const { data: conns } = await db
      .from('meeting_host_google_connections')
      .select('host_profile_id, status')
      .in('host_profile_id', allIds)
      .eq('status', 'active');
    const healthy = new Set(
      ((conns ?? []) as any[]).map((c) => c.host_profile_id).filter(Boolean)
    );

    // Group the un-connected by college. People with no institution_id have no
    // Principal to chase them and are left to the EAO-wide view, not invented
    // into somebody else's college.
    const byInstitution = new Map<string, string[]>();
    for (const p of people.values()) {
      if (healthy.has(p.id)) continue;
      result.people_unconnected++;
      if (!p.institutionId) continue;
      const list = byInstitution.get(p.institutionId) ?? [];
      list.push(p.name);
      byInstitution.set(p.institutionId, list);
    }
    if (byInstitution.size === 0) {
      result.ran = true;
      return result;
    }

    const eaoIds = await getExecutiveAdminOfficerIds(db);

    for (const [institutionId, names] of byInstitution.entries()) {
      try {
        const { recipientIds, createdBy, fallbackToAdmin } =
          await resolveRecipients(db, institutionId);
        // Director decision 2026-07-30 #5: this summary goes ONLY to principals
        // who are themselves connected, plus the EAO. Previously an unconnected
        // principal received a list of other unconnected people and reasonably
        // concluded the message was not about them — which is a large part of
        // why 9 of 11 principals were still unconnected. The unconnected are now
        // chased by the EAO in person, not by a note they discount.
        const audience = [
          ...new Set([...recipientIds.filter((id) => healthy.has(id)), ...eaoIds])
        ];
        if (audience.length === 0 || !createdBy) continue;

        const instName = await getInstitutionName(db, institutionId);
        const shown = names.slice(0, 12);
        const more = names.length - shown.length;

        const notificationId = await createBellNotification(db, {
          recipientIds: audience,
          createdBy,
          idempotencyKey: weeklyKey(institutionId),
          title: `${names.length} ${names.length === 1 ? 'person' : 'people'} at ${instName} still have no calendar connected`,
          body:
            `Accountability review meetings cannot be scheduled for anyone whose ` +
            `Google Calendar is not connected — the engine will not put a time on ` +
            `someone's day it cannot see. Still not connected at ${instName}: ` +
            `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}. ` +
            `Ask them to open Meetings → Availability and connect Google Calendar.` +
            (fallbackToAdmin
              ? ' (No principal on record yet — routed to administration.)'
              : ''),
          url: CONNECT_CALENDAR_URL,
          category: WEEKLY_SUMMARY_CATEGORY,
          // 2026-08-10 expiry: a weekly restatement of who is still
          // unconnected, keyed per ISO week — next Monday's edition recomputes
          // the same list, and the list itself is on the Meetings surface. 37 of
          // these had accumulated unexpired. TTL = 1.5x the WEEKLY cycle (not
          // the hourly producer's tick): the row must outlive the gap to the
          // next edition, so the cadence that matters is the one the
          // idempotency key encodes.
          expiresAt: new Date(
            now.getTime() + WEEKLY_SUMMARY_TTL_MS
          ).toISOString(),
          metadata: {
            iso_week: isoWeek,
            institution_id: institutionId,
            unconnected_count: names.length,
            source: 'cron:meeting-trigger-reconcile'
          }
        });
        // null = the unique index refused a second send for this week. Not an
        // error; just nothing to count.
        if (notificationId) result.institutions_notified++;
      } catch (e: any) {
        result.errors.push(
          `weekly summary ${institutionId}: ${e?.message ?? String(e)}`
        );
      }
    }

    result.ran = true;
  } catch (e: any) {
    result.errors.push(`weekly summary: ${e?.message ?? String(e)}`);
    logger.error(MODULE, 'sendWeeklyCalendarConnectSummary failed', e);
  }

  return result;
}

// ============================================================================
// CALENDAR-CONNECT LOCK SWEEP (Director decision 2026-08-18)
// ============================================================================
// 16 review meetings could not be scheduled because the people in them had never
// connected Google Calendar. The daily bell nudge above had already fired on all
// 16 without effect, and the weekly Principal summary had gone out too — so the
// Director escalated: anyone holding a booking page connects, or MyJKKN stops
// for them after a 3-day warning.
//
// The state machine itself is `fn_calendar_lock_sweep` in SQL, deliberately NOT
// here: the rule decides who loses access to a multi-tenant platform, so it is
// one auditable object that a migration has to change, rather than logic spread
// across a service. This wrapper exists only so the hourly cron can call it the
// same way it calls every other pass, and so a failure is reported rather than
// swallowed.
//
// While the master switch is off — which is how it ships — this returns zeroes.

export interface CalendarLockSweepResult {
  /** People who entered the 3-day grace window on this pass. */
  warned: number;
  /** People whose grace expired on this pass and who are now held. */
  locked: number;
  /** People released because they connected (or the switch went off). */
  cleared: number;
}

export async function sweepCalendarConnectLock(
  opts: { client?: SupabaseClient } = {}
): Promise<CalendarLockSweepResult> {
  const db = opts.client ?? createServiceRoleClient();
  const { data, error } = await (db as any).rpc('fn_calendar_lock_sweep');
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  const result: CalendarLockSweepResult = {
    warned: Number(row?.warned ?? 0),
    locked: Number(row?.locked ?? 0),
    cleared: Number(row?.cleared ?? 0),
  };

  // Locking someone out of the whole platform is not routine traffic — it should
  // be findable in the logs on the day someone asks "why can't I get in?".
  if (result.locked > 0) {
    logger.warn(
      MODULE,
      `calendar-connect lock: ${result.locked} person(s) now held at /auth/connect-calendar`,
      result
    );
  }
  return result;
}
