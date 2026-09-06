// =====================================================================
// Weekly intake-readiness alarm — pure logic + orchestration
// =====================================================================
// Director approval: rank 9 of the 2026-08-11 invisible-learners audit.
// Every week, per college, FOUR numbers for the current admission year:
//   1. paid-but-not-activated ('reserved'/'admitted') — invisible to attendance
//   2. unplaced (admitted/active, no class group)
//   3. programmes with a current-year cohort and ZERO timetabled class groups
//   4. learners admitted 7+ days ago with no bill of any kind
// The numbers go to that college's Principal(s). Any metric above zero for
// TWO CONSECUTIVE weeks additionally escalates to the Director.
//
// The numbers themselves are computed by the SECURITY DEFINER RPC
// fn_intake_readiness_weekly_alarm (migration 20260825020000, service_role
// only). This module owns everything around it: IST week arithmetic, row
// coercion, the consecutive-weeks rule, message wording, recipient
// resolution, and the ai_jobs state row that makes next week's comparison
// possible. It lives in lib/services (not the route file) because Next.js
// forbids exporting helpers from a route.ts, and untestable escalation logic
// is how a rule like this quietly stops firing.
//
// STATE: each run records its result as an ai_jobs row (job_type
// 'intake_readiness.weekly_alarm', status 'done') — deliberately NOT a new
// state table. "Two consecutive weeks" reads the row whose week_start is
// exactly 7 days before this week's; a missed week therefore RESETS the
// streak (we cannot know a week nobody measured).
//
// Delivery is the existing deliverInApp two-write contract
// (lib/social/notify.ts): notifications.idempotency_key is a PARTIAL unique
// index, so .upsert(onConflict) would fail at runtime — deliverInApp already
// does the correct check-then-insert with a 23505 race guard.
// =====================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverInApp } from '@/lib/social/notify';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG_MODULE = 'academic/intake-readiness-alarm';

/** ai_jobs.job_type used for weekly state rows (seeded by 20260825020000). */
export const INTAKE_ALARM_JOB_TYPE = 'intake_readiness.weekly_alarm';

/** Registry id — must match the ai_routine_schedules seed + lib/ai-routines. */
export const INTAKE_ALARM_ROUTINE_ID = 'intake-readiness-alarm';

/** Deep link the notification opens — the dashboard's Intake Readiness tab. */
export const INTAKE_ALARM_URL = '/academic/attendance/dashboard?tab=readiness';

export const ALARM_METRICS = [
  'paid_not_activated',
  'unplaced_learners',
  'programmes_without_timetable',
  'admitted_no_bill',
] as const;

export type AlarmMetric = (typeof ALARM_METRICS)[number];

/** Plain-English labels — worded for a Principal, not a developer. */
export const METRIC_LABELS: Record<AlarmMetric, string> = {
  paid_not_activated:
    'paid/admitted learners not yet activated (invisible to attendance)',
  unplaced_learners: 'learners with no class group',
  programmes_without_timetable:
    'programmes with learners but zero timetabled class groups',
  admitted_no_bill: 'learners admitted 7+ days ago with no bill',
};

export interface CollegeAlarmNumbers {
  institution_id: string;
  institution_name: string;
  paid_not_activated: number;
  unplaced_learners: number;
  programmes_without_timetable: number;
  admitted_no_bill: number;
  current_year_total: number;
}

/** The shape stored in (and read back from) ai_jobs.result. */
export interface WeeklyAlarmState {
  week_start: string; // IST Monday, 'YYYY-MM-DD'
  colleges: CollegeAlarmNumbers[];
}

export interface CollegeEscalation {
  institution_id: string;
  institution_name: string;
  metrics: Array<{ metric: AlarmMetric; prior: number; current: number }>;
}

// ---------------------------------------------------------------------------
// IST week arithmetic (JKKN is India-only; IST is +05:30, no DST)
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

export interface IstWeekInfo {
  /** true when it is Monday in IST — the routine's only run day. */
  isMonday: boolean;
  /** IST date of THIS week's Monday, 'YYYY-MM-DD'. */
  weekStart: string;
  /** IST date of LAST week's Monday, 'YYYY-MM-DD'. */
  prevWeekStart: string;
}

/**
 * Week arithmetic in IST wall-clock. The dispatcher fires on IST schedules,
 * but a Vercel function's clock is UTC — Sunday 19:30 UTC is already Monday
 * 01:00 IST, so the shift must happen before any weekday question is asked.
 */
export function istWeekInfo(now: Date = new Date()): IstWeekInfo {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const weekday = ist.getUTCDay(); // 0=Sun..6=Sat, in IST wall-clock
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(ist.getTime());
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  const prevMonday = new Date(monday.getTime());
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  return {
    isMonday: weekday === 1,
    weekStart: monday.toISOString().slice(0, 10),
    prevWeekStart: prevMonday.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Assembly — RPC rows in, normalized per-college numbers out
// ---------------------------------------------------------------------------

/** PostgREST serialises bigint as number OR string depending on magnitude. */
function toCount(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * Normalize fn_intake_readiness_weekly_alarm rows. Rows without an
 * institution id are dropped (nothing to notify); every count is coerced to a
 * non-negative integer so message text and comparisons never see NaN.
 */
export function assembleCollegeAlarms(rows: unknown[]): CollegeAlarmNumbers[] {
  const out: CollegeAlarmNumbers[] = [];
  for (const raw of rows ?? []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = typeof r.alarm_institution_id === 'string' ? r.alarm_institution_id : null;
    if (!id) continue;
    out.push({
      institution_id: id,
      institution_name:
        typeof r.alarm_institution_name === 'string' && r.alarm_institution_name.trim()
          ? r.alarm_institution_name
          : 'Unknown institution',
      paid_not_activated: toCount(r.paid_not_activated),
      unplaced_learners: toCount(r.unplaced_learners),
      programmes_without_timetable: toCount(r.programmes_without_timetable),
      admitted_no_bill: toCount(r.admitted_no_bill),
      current_year_total: toCount(r.current_year_total),
    });
  }
  return out;
}

/** true when any of the four alarm numbers is above zero. */
export function anyMetricAboveZero(c: CollegeAlarmNumbers): boolean {
  return ALARM_METRICS.some((m) => c[m] > 0);
}

// ---------------------------------------------------------------------------
// The two-consecutive-weeks escalation rule
// ---------------------------------------------------------------------------

/**
 * A college escalates when the SAME metric is above zero this week AND was
 * above zero in last week's recorded run. Strictly consecutive: the prior
 * state must be for exactly `expectedPriorWeekStart` — if the alarm skipped a
 * week (deploy gap, dispatcher outage) the streak resets rather than
 * comparing against stale numbers, because "it was bad 3 weeks ago and is
 * bad now" is not what the Director approved ("2 CONSECUTIVE weeks").
 */
export function computeEscalations(
  current: CollegeAlarmNumbers[],
  prior: WeeklyAlarmState | null | undefined,
  expectedPriorWeekStart: string,
): CollegeEscalation[] {
  if (!prior || prior.week_start !== expectedPriorWeekStart) return [];
  const priorByInstitution = new Map(
    (prior.colleges ?? []).map((c) => [c.institution_id, c]),
  );
  const escalations: CollegeEscalation[] = [];
  for (const college of current) {
    const before = priorByInstitution.get(college.institution_id);
    if (!before) continue;
    const metrics = ALARM_METRICS.filter(
      (m) => college[m] > 0 && toCount(before[m]) > 0,
    ).map((m) => ({ metric: m, prior: toCount(before[m]), current: college[m] }));
    if (metrics.length > 0) {
      escalations.push({
        institution_id: college.institution_id,
        institution_name: college.institution_name,
        metrics,
      });
    }
  }
  return escalations;
}

// ---------------------------------------------------------------------------
// Message wording
// ---------------------------------------------------------------------------

export function buildPrincipalNotification(
  college: CollegeAlarmNumbers,
  weekStart: string,
): { title: string; body: string } {
  if (college.current_year_total === 0) {
    // The audit's six-colleges-at-zero finding: an empty cohort must never
    // read as an all-clear.
    return {
      title: `Intake readiness — week of ${weekStart}`,
      body:
        `${college.institution_name}: no learners are on the books yet for the ` +
        `current admission year. All four readiness numbers are zero only ` +
        `because there is nobody to count.`,
    };
  }
  const flagged = ALARM_METRICS.filter((m) => college[m] > 0);
  if (flagged.length === 0) {
    return {
      title: `Intake readiness — week of ${weekStart}: all clear`,
      body:
        `${college.institution_name}: all four intake-readiness checks are at ` +
        `zero this week (${college.current_year_total.toLocaleString()} ` +
        `current-year learners on the books).`,
    };
  }
  const parts = flagged.map((m) => `${college[m].toLocaleString()} ${METRIC_LABELS[m]}`);
  return {
    title: `Intake readiness — week of ${weekStart}: ${flagged.length} number${flagged.length === 1 ? '' : 's'} above zero`,
    body: `${college.institution_name}: ${parts.join(' · ')}. Numbers above zero for 2 consecutive weeks escalate to the Director automatically.`,
  };
}

export function buildDirectorNotification(
  escalations: CollegeEscalation[],
  weekStart: string,
): { title: string; body: string } {
  const lines = escalations.map((e) => {
    const metricBits = e.metrics.map(
      (m) =>
        `${METRIC_LABELS[m.metric]} (last week ${m.prior.toLocaleString()}, this week ${m.current.toLocaleString()})`,
    );
    return `${e.institution_name}: ${metricBits.join(' · ')}`;
  });
  return {
    title: `Intake readiness: ${escalations.length} college${escalations.length === 1 ? '' : 's'} above zero for 2 consecutive weeks`,
    body: `Week of ${weekStart}. ${lines.join(' — ')}`,
  };
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

/**
 * Active Principals per institution — the copo-attainment recipient pattern:
 * Role-Management holders (user_roles JOIN custom_roles role_key='principal')
 * PLUS the legacy profiles.role='principal' string, deduped. A recipient
 * LOOKUP by role, not an authorization gate.
 */
export async function resolvePrincipalsByInstitution(
  admin: SupabaseClient,
  institutionIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (institutionIds.length === 0) return result;

  const { data: principalRole } = await admin
    .from('custom_roles')
    .select('id')
    .eq('role_key', 'principal')
    .eq('is_active', true)
    .maybeSingle();

  let roleUserIds: string[] = [];
  if (principalRole?.id) {
    const { data: ur } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('role_id', principalRole.id);
    roleUserIds = (ur ?? []).map((x) => x.user_id as string).filter(Boolean);
  }

  for (const institutionId of institutionIds) {
    const recipients = new Set<string>();
    if (roleUserIds.length > 0) {
      // Role holders are a small set (~1 per college); no .in() chunking needed
      // at this size, and the institution filter keeps the result per-college.
      const { data: viaRoles } = await admin
        .from('profiles')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .in('id', roleUserIds);
      for (const p of viaRoles ?? []) recipients.add(p.id as string);
    }
    const { data: viaLegacy } = await admin
      .from('profiles')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .eq('role', 'principal');
    for (const p of viaLegacy ?? []) recipients.add(p.id as string);
    result.set(institutionId, [...recipients]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface RunDeps {
  deliver: typeof deliverInApp;
  /** Director ids (falls back to super admins inside resolveDirectors). */
  resolveDirectorIds: (admin: SupabaseClient) => Promise<{ ids: string[]; source: string }>;
  resolvePrincipals: typeof resolvePrincipalsByInstitution;
}

const defaultDeps: RunDeps = {
  deliver: deliverInApp,
  resolveDirectorIds: async (admin) => {
    // Dynamic import: handover-chase-service transitively pulls the meeting
    // email stack (whose Resend client throws at module load without an API
    // key). Loading it only when an escalation actually needs the Director
    // keeps this module importable in tests and lean in the route bundle.
    const { resolveDirectors } = await import(
      '@/lib/services/director-desk/handover-chase-service'
    );
    const r = await resolveDirectors(admin);
    return { ids: r.ids, source: r.source };
  },
  resolvePrincipals: resolvePrincipalsByInstitution,
};

export interface RunResult {
  ok: boolean;
  error?: string;
  week_start: string;
  /** colleges examined (active institutions returned by the RPC) */
  examined: number;
  /** colleges with at least one number above zero */
  flagged: number;
  /** notifications delivered this run (principals + director) */
  sent: number;
  /** deliveries deduped by idempotency key (safe re-run) */
  duplicates: number;
  /** colleges escalated to the Director (2 consecutive weeks) */
  escalations: number;
  /** flagged colleges with no Principal to tell — the audit's exact harm */
  unreachable: number;
  /** whether this week's state row was written (false on re-run/dry-run) */
  state_recorded: boolean;
  dry_run: boolean;
}

/**
 * One weekly run. The caller (the cron route) has already authorized and
 * weekday-gated; this reads the numbers, tells each Principal, applies the
 * two-consecutive-weeks rule, and records this week's state for next week.
 */
export async function runIntakeReadinessAlarm(
  admin: SupabaseClient,
  opts: { now?: Date; dryRun?: boolean; deps?: Partial<RunDeps> } = {},
): Promise<RunResult> {
  const deps: RunDeps = { ...defaultDeps, ...(opts.deps ?? {}) };
  const dryRun = opts.dryRun === true;
  const { weekStart, prevWeekStart } = istWeekInfo(opts.now ?? new Date());

  const base: RunResult = {
    ok: false,
    week_start: weekStart,
    examined: 0,
    flagged: 0,
    sent: 0,
    duplicates: 0,
    escalations: 0,
    unreachable: 0,
    state_recorded: false,
    dry_run: dryRun,
  };

  // 1) The four numbers, per college. A missing RPC (migration 20260825020000
  //    not applied yet) fails LOUDLY here — never a cheerful empty success.
  const { data: rpcRows, error: rpcError } = await admin.rpc(
    'fn_intake_readiness_weekly_alarm',
  );
  if (rpcError) {
    logger.error(LOG_MODULE, 'fn_intake_readiness_weekly_alarm failed', rpcError);
    return { ...base, error: rpcError.message };
  }
  const colleges = assembleCollegeAlarms((rpcRows ?? []) as unknown[]);
  base.examined = colleges.length;
  if (colleges.length === 0) {
    // Zero active institutions is not a plausible healthy state on this
    // platform — report it as a failure so the dispatcher status says so.
    logger.error(LOG_MODULE, 'alarm RPC returned zero institutions', {});
    return { ...base, error: 'alarm RPC returned zero institutions' };
  }

  // 2) Prior weeks' state (this routine's own ai_jobs rows).
  const { data: priorJobs, error: priorError } = await admin
    .from('ai_jobs')
    .select('id, result')
    .eq('job_type', INTAKE_ALARM_JOB_TYPE)
    .eq('status', 'done')
    .order('requested_at', { ascending: false })
    .limit(8);
  if (priorError) {
    // Without prior state the consecutive-weeks rule cannot run honestly;
    // stop rather than silently under-escalating.
    logger.error(LOG_MODULE, 'reading prior alarm state failed', priorError);
    return { ...base, error: priorError.message };
  }
  const states = (priorJobs ?? [])
    .map((j) => (j.result ?? null) as WeeklyAlarmState | null)
    .filter((s): s is WeeklyAlarmState => !!s && typeof s.week_start === 'string');
  const priorState = states.find((s) => s.week_start === prevWeekStart) ?? null;
  const alreadyRecordedThisWeek = states.some((s) => s.week_start === weekStart);

  const escalations = computeEscalations(colleges, priorState, prevWeekStart);
  base.escalations = escalations.length;

  // 3) Tell each college's Principal(s) — every week, zeros included, so a
  //    silent week is distinguishable from a broken alarm.
  const principals = await deps.resolvePrincipals(
    admin,
    colleges.map((c) => c.institution_id),
  );
  // The next edition lands in 7 days; keep the bell honest by expiring this
  // one shortly after (8d grace covers a late dispatcher tick).
  const expiresAt = new Date(
    (opts.now ?? new Date()).getTime() + 8 * 24 * 3600 * 1000,
  ).toISOString();

  for (const college of colleges) {
    if (anyMetricAboveZero(college)) base.flagged += 1;
    const recipients = principals.get(college.institution_id) ?? [];
    if (recipients.length === 0) {
      if (anyMetricAboveZero(college)) {
        base.unreachable += 1;
        logger.warn(LOG_MODULE, 'flagged college has no Principal to notify', {
          institution_id: college.institution_id,
          institution_name: college.institution_name,
        });
      }
      continue;
    }
    if (dryRun) continue;
    const { title, body } = buildPrincipalNotification(college, weekStart);
    for (const userId of recipients) {
      const outcome = await deps.deliver(admin, {
        recipientId: userId,
        title,
        body,
        url: INTAKE_ALARM_URL,
        category: 'academic:intake-readiness',
        idempotencyKey: `intake-readiness:${weekStart}:${college.institution_id}:${userId}`,
        expiresAt,
        metadata: {
          week_start: weekStart,
          institution_id: college.institution_id,
          numbers: {
            paid_not_activated: college.paid_not_activated,
            unplaced_learners: college.unplaced_learners,
            programmes_without_timetable: college.programmes_without_timetable,
            admitted_no_bill: college.admitted_no_bill,
          },
        },
      });
      if (outcome === 'delivered') base.sent += 1;
      else if (outcome === 'duplicate') base.duplicates += 1;
    }
  }

  // 4) Escalate to the Director (super-admin fallback lives inside
  //    resolveDirectors, with the fallback recorded in `source`).
  if (escalations.length > 0 && !dryRun) {
    const directors = await deps.resolveDirectorIds(admin);
    if (directors.ids.length === 0) {
      logger.error(LOG_MODULE, 'escalations found but nobody to escalate to', {
        escalations: escalations.length,
      });
    } else {
      if (directors.source !== 'director') {
        logger.warn(LOG_MODULE, 'no director role holder — escalating to fallback', {
          source: directors.source,
        });
      }
      const { title, body } = buildDirectorNotification(escalations, weekStart);
      for (const userId of directors.ids) {
        const outcome = await deps.deliver(admin, {
          recipientId: userId,
          title,
          body,
          url: INTAKE_ALARM_URL,
          category: 'academic:intake-readiness',
          idempotencyKey: `intake-readiness:${weekStart}:director-escalation:${userId}`,
          expiresAt,
          metadata: {
            week_start: weekStart,
            escalations: escalations.map((e) => ({
              institution_id: e.institution_id,
              metrics: e.metrics,
            })),
          },
        });
        if (outcome === 'delivered') base.sent += 1;
        else if (outcome === 'duplicate') base.duplicates += 1;
      }
    }
  }

  // 5) Record this week's state so NEXT week's run can compare. Exactly one
  //    row per week: a re-run of an already-recorded week only re-sends any
  //    deliveries the idempotency keys still allow.
  if (!dryRun && !alreadyRecordedThisWeek) {
    // ai_jobs.requested_by is NOT NULL — cron rows use the first super admin,
    // the platform's created-by convention for system-authored rows.
    const { data: superAdmins } = await admin
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true)
      .order('created_at', { ascending: true })
      .limit(1);
    const requestedBy = superAdmins?.[0]?.id as string | undefined;
    if (!requestedBy) {
      logger.error(LOG_MODULE, 'no super admin found for ai_jobs.requested_by', {});
      return { ...base, ok: true, error: 'state not recorded: no super admin id' };
    }
    const state: WeeklyAlarmState = { week_start: weekStart, colleges };
    const nowIso = (opts.now ?? new Date()).toISOString();
    const { error: insertError } = await admin.from('ai_jobs').insert({
      job_type: INTAKE_ALARM_JOB_TYPE,
      payload: { week_start: weekStart },
      requested_by: requestedBy,
      status: 'done',
      lane: 'api',
      result: { ...state, escalated: escalations.map((e) => e.institution_id) },
      completed_at: nowIso,
    });
    if (insertError) {
      // Notifications went out; the streak state did not land. Say so — next
      // week's run would otherwise silently skip a due escalation.
      logger.error(LOG_MODULE, 'recording weekly alarm state failed', insertError);
      return { ...base, ok: true, error: `state not recorded: ${insertError.message}` };
    }
    base.state_recorded = true;
  }

  return { ...base, ok: true };
}
