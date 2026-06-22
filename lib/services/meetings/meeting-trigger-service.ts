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

const MODULE = 'meetings/triggers';
const ATTENDANCE_METRIC = 'attendance_rate_daily';

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
  }
): Promise<string | null> {
  const { data: notif, error } = await db
    .from('notifications')
    .insert({
      title: opts.title,
      body: opts.body,
      url: opts.url,
      icon: '/icons/icon-192x192.png',
      priority: 'high',
      category: opts.category,
      created_by: opts.createdBy,
      targeting: { user_ids: opts.recipientIds },
      metadata: opts.metadata
    })
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

  for (const rule of (rules ?? []) as TriggerRule[]) {
    if (!rule.institution_id) continue; // global rules unsupported in PR1a
    result.evaluated++;

    try {
      // 1. Quiet window (exam weeks / holidays)
      if (isInQuietWindow(date, rule.quiet_windows)) {
        result.skipped_quiet++;
        continue;
      }

      // 2. Cooldown + weekly cap — count events already fired in the window.
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

      // 3. Compute the metric.
      const { data: rate, error: rpcErr } = await db.rpc(
        'fn_college_day_attendance_rate',
        { p_institution_id: rule.institution_id, p_date: date }
      );
      if (rpcErr) {
        result.errors.push(`rpc ${rule.institution_id}: ${rpcErr.message}`);
        continue;
      }
      if (rate === null || rate === undefined) {
        // No attendance recorded → a data gap (PR3), never a false 0% breach.
        result.skipped_no_data++;
        continue;
      }
      const rateNum = Number(rate);

      // 4. Breach?
      if (!compare(rateNum, rule.comparator, Number(rule.threshold))) continue;
      result.breaches++;

      // 5. Resolve recipients (principal → admin fallback).
      const { recipientIds, createdBy, fallbackToAdmin } =
        await resolveRecipients(db, rule.institution_id);
      if (recipientIds.length === 0 || !createdBy) {
        result.skipped_no_recipient++;
        logger.warn(MODULE, 'Breach with no resolvable recipient', {
          institution_id: rule.institution_id,
          date
        });
        continue;
      }

      // 6. Record the event (idempotent per rule+day).
      const { data: ev, error: evErr } = await db
        .from('meeting_trigger_events')
        .insert({
          rule_id: rule.id,
          institution_id: rule.institution_id,
          metric_key: rule.metric_key,
          observed_value: rateNum,
          threshold: rule.threshold,
          breach_date: date,
          status: 'notified'
        })
        .select('id')
        .single();
      if (evErr) {
        // 23505 = unique violation = already handled for this rule+day.
        if ((evErr as any).code === '23505') continue;
        result.errors.push(`event ${rule.institution_id}: ${evErr.message}`);
        continue;
      }

      // 7. Notify (informational; the explain-or-meet valve arrives in PR1b).
      const instName = await getInstitutionName(db, rule.institution_id);
      const notificationId = await createBellNotification(db, {
        recipientIds,
        createdBy,
        title: `Attendance below threshold — ${instName}`,
        body:
          `${instName} recorded ${rateNum}% attendance on ${date}, below the ` +
          `${rule.threshold}% line being tracked.` +
          (fallbackToAdmin
            ? ' (No principal on record — routed to administration.)'
            : ''),
        url: '/academic/attendance',
        category: 'attendance:breach',
        metadata: {
          rule_id: rule.id,
          institution_id: rule.institution_id,
          breach_date: date,
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
    } catch (e: any) {
      result.errors.push(`rule ${rule.id}: ${e?.message ?? String(e)}`);
    }
  }

  return result;
}
