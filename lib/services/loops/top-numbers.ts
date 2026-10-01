// ============================================================================
// THE TWO TOP NUMBERS — T1 (defect hours) and T2 (adoption share)
// ============================================================================
// Spec: specs/2026-09-18-loop-graph-and-two-top-numbers.md
// (Director 2026-09-18 06:24/06:27 — "two top numbers, side by side").
//
// Every loop in MyJKKN is supposed to serve one of exactly two numbers, so a
// loop's bar can be judged by whether the top actually moved:
//
//   T1  Weekly hours real users lose to defects   → lower is better
//   T2  Share of shipped features actually used   → higher is better
//
// This module is the COMPUTATION only. It writes nothing: the weekly cron
// (/api/cron/top-numbers) hands each reading to fn_loop_record_measurement,
// the single writer of loop_measurements.
//
// THREE RULES IT WILL NOT BEND
//  1. Never a fake number. When Sentry cannot be read, or nothing is wired for
//     usage yet, the reading is value = NULL with an honest `gap` sentence —
//     never a zero, never a silent skip (rule #27).
//  2. Never a rewritten history. The minute-constants are the first honest
//     guess and WILL be recalibrated from the adoption "why not" answers and
//     reporter comments. Each measurement therefore carries the constants it
//     was computed with inside run_id, so a later recalibration changes the
//     next reading and leaves every past one intact.
//  3. met is always NULL here. Neither top number has an approved bar yet, and
//     met = NULL is neither a hit nor a miss — it never moves a miss streak.
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';

type Admin = ReturnType<typeof createServiceRoleClient>;

// ── Constants — platform_policies rows, read at run time ────────────────────
//
// HOUSE RULE: docs/architecture/config-table-pattern.md. Every threshold a
// super admin might retune — "even once" — is a DATABASE ROW read at run time
// with an in-code fallback, never a literal that needs a deploy to change.
// The spec says outright that these five WILL be recalibrated from the
// adoption "why not" answers and reporter comments, which makes them the
// pattern's central case, not an edge of it.
//
// Same shape as loops.proven_green.* (seeded by 20260813033300, read by
// /admin/loops): scope_type = 'global' rows, numeric jsonb value, in-code
// fallback when the row is absent — so both numbers are computable before the
// seed migration is applied, and a retune changes the NEXT reading only.
// Every measurement still records the values it actually used inside run_id,
// so a recalibration never rewrites a past reading.

export const TOP_NUMBER_POLICY_KEYS = {
  t1MinutesPerAffectedUser: 'top_numbers.t1_minutes_per_affected_user',
  t1MinutesPerReporter: 'top_numbers.t1_minutes_per_reporter',
  t1BugMinAgeDays: 'top_numbers.t1_bug_min_age_days',
  t2UsedSharePct: 'top_numbers.t2_used_share_pct',
  t2MinAgeDays: 'top_numbers.t2_min_age_days',
  t2ExcludedFeatureKeys: 'top_numbers.t2_excluded_feature_keys',
} as const;

/** T1: minutes one affected person loses to one user-facing production error. */
export const T1_MINUTES_PER_AFFECTED_USER = 2;
/** T1: minutes one reporter loses to one open bug report. */
export const T1_MINUTES_PER_REPORTER = 5;
/** T1: a bug report younger than this is still being triaged, not yet a loss. */
export const T1_BUG_MIN_AGE_DAYS = 1;
/** T2: weekly reach of an intended role at or above this counts as "used". */
export const T2_USED_SHARE_PCT = 20;
/** T2: a feature younger than this has not had a fair chance to be adopted. */
export const T2_MIN_AGE_DAYS = 14;

/**
 * T2: feature keys that are NOT features whose adoption is measured.
 *
 * `app.login` is the app-wide daily sign-in line, not something shipped for a
 * role to adopt: every signed-in person records it, so leaving it in would add
 * one permanently-"used" feature to every week's share. The merged adoption
 * metric excludes it on exactly this ground
 * (20260916190200_adoption_metrics.sql: `WHERE fr.feature_key <> 'app.login'`,
 * with supabase/tests/adoption/10_scenarios.sql asserting it appears in no
 * metrics row), so dropping the exclusion here would make T2 disagree with the
 * adoption loop it is supposed to be the top number FOR.
 *
 * It is a POLICY ROW rather than a silent filter: the exclusion is visible on
 * /admin's policy table, editable without a deploy, and recorded inside every
 * measurement's run_id, so nobody has to read this file to learn that one key
 * is left out.
 */
export const T2_EXCLUDED_FEATURE_KEYS: readonly string[] = ['app.login'];

/** bug_reports statuses that mean the report is NOT costing anybody time. */
export const T1_CLOSED_BUG_STATUSES = ['resolved', 'closed', 'wont_fix', 'duplicate'] as const;

/** The five dials plus the exclusion list, as actually resolved for one run. */
export interface TopNumberConstants {
  t1MinutesPerAffectedUser: number;
  t1MinutesPerReporter: number;
  t1BugMinAgeDays: number;
  t2UsedSharePct: number;
  t2MinAgeDays: number;
  t2ExcludedFeatureKeys: string[];
}

/** What the numbers are computed with when no policy row is readable. */
export const TOP_NUMBER_FALLBACKS: TopNumberConstants = {
  t1MinutesPerAffectedUser: T1_MINUTES_PER_AFFECTED_USER,
  t1MinutesPerReporter: T1_MINUTES_PER_REPORTER,
  t1BugMinAgeDays: T1_BUG_MIN_AGE_DAYS,
  t2UsedSharePct: T2_USED_SHARE_PCT,
  t2MinAgeDays: T2_MIN_AGE_DAYS,
  t2ExcludedFeatureKeys: [...T2_EXCLUDED_FEATURE_KEYS],
};

/**
 * Reads the six policy rows, falling back per-key to the in-code default.
 *
 * Mirrors the `policyNum` read on /admin/loops: a single global-scope select,
 * a rejected read treated as "no rows" rather than an exception, and a value
 * that is not a finite number ignored in favour of the fallback — a malformed
 * row must never turn a top number into nonsense. Zero IS accepted (a bug age
 * of 0 days is a legitimate retune); only non-numbers and negatives are not.
 */
export async function loadTopNumberConstants(admin: Admin): Promise<TopNumberConstants> {
  const rows = await admin
    .from('platform_policies')
    .select('policy_key, value')
    .in('policy_key', Object.values(TOP_NUMBER_POLICY_KEYS))
    .eq('scope_type', 'global')
    .then(
      (r) => (r.data ?? []) as { policy_key: string; value: unknown }[],
      () => [] as { policy_key: string; value: unknown }[]
    );

  const raw = (key: string): unknown => rows.find((p) => p.policy_key === key)?.value;

  const num = (key: string, fallback: number): number => {
    const v = raw(key);
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const list = (key: string, fallback: string[]): string[] => {
    const v = raw(key);
    if (!Array.isArray(v)) return fallback;
    const strings = v.filter((x): x is string => typeof x === 'string');
    // An array that is present but holds nothing usable is an EMPTY exclusion
    // list, deliberately — that is how the Director turns the exclusion off.
    return strings.length === v.length ? strings : fallback;
  };

  return {
    t1MinutesPerAffectedUser: num(
      TOP_NUMBER_POLICY_KEYS.t1MinutesPerAffectedUser,
      T1_MINUTES_PER_AFFECTED_USER
    ),
    t1MinutesPerReporter: num(TOP_NUMBER_POLICY_KEYS.t1MinutesPerReporter, T1_MINUTES_PER_REPORTER),
    t1BugMinAgeDays: num(TOP_NUMBER_POLICY_KEYS.t1BugMinAgeDays, T1_BUG_MIN_AGE_DAYS),
    t2UsedSharePct: num(TOP_NUMBER_POLICY_KEYS.t2UsedSharePct, T2_USED_SHARE_PCT),
    t2MinAgeDays: num(TOP_NUMBER_POLICY_KEYS.t2MinAgeDays, T2_MIN_AGE_DAYS),
    t2ExcludedFeatureKeys: list(TOP_NUMBER_POLICY_KEYS.t2ExcludedFeatureKeys, [
      ...T2_EXCLUDED_FEATURE_KEYS,
    ]),
  };
}

export const TOP_DEFECT_HOURS_KEY = 'top-defect-hours';
export const TOP_ADOPTION_SHARE_KEY = 'top-adoption-share';

/** The exact sentence the spec requires while nothing records usage yet. */
export const T2_INSUFFICIENT_GAP = 'insufficient — usage record not live';

// ── The week ────────────────────────────────────────────────────────────────

export interface IsoWeek {
  /** Monday 00:00 Asia/Kolkata, as a UTC instant. */
  startUtc: Date;
  /** The following Monday 00:00 Asia/Kolkata, as a UTC instant (exclusive). */
  endUtc: Date;
  /** 'YYYY-MM-DD' of the Monday, in IST — matches feature_usage.day. */
  startDay: string;
  /** 'YYYY-MM-DD' of the Sunday, in IST (inclusive). */
  endDay: string;
  /** e.g. '2026-W38'. */
  label: string;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function istDayString(utc: Date): string {
  return new Date(utc.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO-8601 week number of the IST calendar day an instant falls on. */
function isoWeekLabel(utc: Date): string {
  // Work on the IST wall-clock date, read with UTC getters.
  const d = new Date(utc.getTime() + IST_OFFSET_MS);
  d.setUTCHours(0, 0, 0, 0);
  // ISO: the week's Thursday decides which year — and which week — it is.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * The last COMPLETE ISO week (Monday..Sunday, Asia/Kolkata), relative to `now`.
 * The cron fires Monday morning IST, so this is always the week that just
 * ended — a top number is never computed from a half-finished week.
 */
export function lastCompleteIsoWeek(now: Date): IsoWeek {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7;
  const thisMondayIstMidnightUtc = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) -
      IST_OFFSET_MS -
      daysSinceMonday * DAY_MS
  );
  const startUtc = new Date(thisMondayIstMidnightUtc.getTime() - 7 * DAY_MS);
  const endUtc = thisMondayIstMidnightUtc;
  return {
    startUtc,
    endUtc,
    startDay: istDayString(startUtc),
    endDay: istDayString(new Date(endUtc.getTime() - DAY_MS)),
    label: isoWeekLabel(startUtc),
  };
}

// ── The reading a cron hands to fn_loop_record_measurement ──────────────────

export interface TopNumberReading {
  loopKey: string;
  /** NULL whenever the number could not be computed honestly. */
  value: number | null;
  /** Plain English: the number, or the reason there is none. */
  gap: string;
  /** JSON: the week, the constants used, and the working. Never rewritten. */
  runId: string;
  /** T1 only: which Sentry secret was actually used, fallback included. */
  tokenSource?: SentryTokenSource;
}

// ── T1: weekly hours real users lose to defects ─────────────────────────────

export interface SentryGroup {
  id: string;
  title?: string | null;
  culprit?: string | null;
  level?: string | null;
  userCount?: number | null;
}

/**
 * Which secret the Sentry read ran on.
 *
 * The fallback is deliberate — production already holds SENTRY_AUTH_TOKEN and
 * /api/cron/sentry-lane-2 runs on it, so T1 is not dark while a dedicated
 * read-only secret is minted. It is NOT silent: the value travels into the
 * measurement's recorded constants and the cron's own JSON, so "which token
 * was this number read with" is answerable from the row, months later.
 */
export type SentryTokenSource =
  | 'SENTRY_READ_TOKEN'
  | 'SENTRY_AUTH_TOKEN (fallback)'
  | 'none';

/** Either the groups for the window, or the honest reason there are none. */
export type SentryReadResult =
  | { groups: SentryGroup[]; tokenSource: SentryTokenSource }
  | { error: string; tokenSource: SentryTokenSource };

export type SentryReader = (week: IsoWeek) => Promise<SentryReadResult>;

/** A cron route's own errors are not a user losing time — they are excluded. */
export function isCronGroup(group: SentryGroup): boolean {
  const haystack = `${group.culprit ?? ''} ${group.title ?? ''}`.toLowerCase();
  return haystack.includes('/api/cron');
}

/** Only user-facing severities count; 'warning'/'info' are not lost time. */
export function isUserFacingLevel(group: SentryGroup): boolean {
  const level = (group.level ?? '').toLowerCase();
  return level === 'error' || level === 'fatal';
}

/**
 * T1 = (Σ sentry users_affected × 2 min + Σ open-bug reporters × 5 min) / 60.
 *
 * When Sentry cannot be read the WHOLE number is NULL — half of T1 is not T1,
 * and a half-number on the Director's page would read as a real fall.
 */
export async function computeDefectHours(
  admin: Admin,
  readSentry: SentryReader,
  week: IsoWeek,
  k: TopNumberConstants = TOP_NUMBER_FALLBACKS
): Promise<TopNumberReading> {
  // ── the reported half: open bug_reports at least a day old ───────────────
  // A COUNT, not a page of rows: a `select()` would stop at PostgREST's row
  // cap and undercount in silence — the "an empty answer is not proof of
  // absence" class. One report = one reporter; rows already marked a duplicate
  // of another report are excluded so the same complaint is counted once.
  const olderThan = new Date(week.endUtc.getTime() - k.t1BugMinAgeDays * DAY_MS).toISOString();
  let reporterCount: number | null = null;
  let bugError: string | null = null;
  try {
    const { count, error } = await admin
      .from('bug_reports')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', `(${T1_CLOSED_BUG_STATUSES.join(',')})`)
      .is('duplicate_of', null)
      .lte('created_at', olderThan);
    if (error) {
      bugError = error.message;
    } else if (typeof count !== 'number') {
      bugError = 'bug_reports returned no count';
    } else {
      reporterCount = count;
    }
  } catch (e) {
    bugError = e instanceof Error ? e.message : String(e);
  }

  // ── the unreported half: Sentry ──────────────────────────────────────────
  const sentry = await readSentry(week);

  // The constants carried INTO the row, including which Sentry secret this
  // reading was actually taken with — a fallback nobody can see is a fallback
  // nobody can audit.
  const constants = {
    sentry_minutes_per_affected_user: k.t1MinutesPerAffectedUser,
    bug_minutes_per_reporter: k.t1MinutesPerReporter,
    bug_min_age_days: k.t1BugMinAgeDays,
    token_source: sentry.tokenSource,
  };

  if ('error' in sentry) {
    return {
      loopKey: TOP_DEFECT_HOURS_KEY,
      value: null,
      gap: `insufficient — ${sentry.error}`,
      tokenSource: sentry.tokenSource,
      runId: JSON.stringify({
        week: week.label,
        week_start: week.startDay,
        week_end: week.endDay,
        constants,
        sentry: { read: false, reason: sentry.error },
        bugs: bugError
          ? { read: false, reason: bugError }
          : { read: true, reporters: reporterCount, minutes: (reporterCount ?? 0) * k.t1MinutesPerReporter },
      }),
    };
  }

  if (bugError !== null || reporterCount === null) {
    return {
      loopKey: TOP_DEFECT_HOURS_KEY,
      value: null,
      gap: `insufficient — bug_reports could not be read: ${bugError ?? 'no rows returned'}`,
      tokenSource: sentry.tokenSource,
      runId: JSON.stringify({
        week: week.label,
        week_start: week.startDay,
        week_end: week.endDay,
        constants,
        sentry: { read: true, groups: sentry.groups.length },
        bugs: { read: false, reason: bugError ?? 'no rows returned' },
      }),
    };
  }

  const counted = sentry.groups.filter((g) => isUserFacingLevel(g) && !isCronGroup(g));
  const affectedUsers = counted.reduce((sum, g) => sum + Math.max(0, g.userCount ?? 0), 0);
  const sentryMinutes = affectedUsers * k.t1MinutesPerAffectedUser;
  const bugMinutes = reporterCount * k.t1MinutesPerReporter;
  const hours = Math.round(((sentryMinutes + bugMinutes) / 60) * 100) / 100;

  return {
    loopKey: TOP_DEFECT_HOURS_KEY,
    value: hours,
    tokenSource: sentry.tokenSource,
    gap:
      `${hours} h lost in ${week.label}: ${affectedUsers} people hit ${counted.length} live production ` +
      `error groups (${k.t1MinutesPerAffectedUser} min each) and ${reporterCount} open bug reports at ` +
      `least ${k.t1BugMinAgeDays} day old (${k.t1MinutesPerReporter} min each). No bar yet.`,
    runId: JSON.stringify({
      week: week.label,
      week_start: week.startDay,
      week_end: week.endDay,
      constants,
      sentry: {
        read: true,
        groups_returned: sentry.groups.length,
        groups_counted: counted.length,
        affected_users: affectedUsers,
        minutes: sentryMinutes,
      },
      bugs: { read: true, reporters: reporterCount, minutes: bugMinutes },
      hours,
    }),
  };
}

// ── T2: share of shipped features actually used ─────────────────────────────

interface RegistryFeature {
  feature_key: string;
  title: string | null;
  intended_roles: string[] | null;
}

interface PersonRole {
  user_id: string;
  role: string | null;
}

interface UsageRow {
  user_id: string;
  feature_key: string;
}

/** feature_usage page size, and the ceiling a single weekly read will walk. */
const USAGE_PAGE = 1000;
const USAGE_MAX_ROWS = 200_000;

/**
 * T2 = (features whose weekly reach clears 20 % of an intended role) ÷
 *      (labelled, live, wired features shipped at least 14 days ago) × 100.
 *
 * A feature with usage_wired = false is NOT in the denominator: nobody records
 * it, so counting it would read as "shipped and unused" when the truth is
 * "shipped and unmeasured" — the exact confusion #3844 was careful to avoid.
 */
export async function computeAdoptionShare(
  admin: Admin,
  week: IsoWeek,
  k: TopNumberConstants = TOP_NUMBER_FALLBACKS
): Promise<TopNumberReading> {
  const constants = {
    used_share_pct: k.t2UsedSharePct,
    min_age_days: k.t2MinAgeDays,
    excluded_feature_keys: k.t2ExcludedFeatureKeys,
  };
  const base = { week: week.label, week_start: week.startDay, week_end: week.endDay, constants };
  const shippedBefore = new Date(week.endUtc.getTime() - k.t2MinAgeDays * DAY_MS).toISOString();

  const insufficient = (reason: string, detail: Record<string, unknown> = {}): TopNumberReading => ({
    loopKey: TOP_ADOPTION_SHARE_KEY,
    value: null,
    gap: reason,
    runId: JSON.stringify({ ...base, ...detail, measured: false }),
  });

  let features: RegistryFeature[];
  try {
    const { data, error } = await admin
      .from('feature_registry')
      .select('feature_key, title, intended_roles')
      .eq('status', 'live')
      .eq('usage_wired', true)
      .lte('shipped_at', shippedBefore);
    if (error) return insufficient(`${T2_INSUFFICIENT_GAP} (feature_registry: ${error.message})`);
    features = (data ?? []) as RegistryFeature[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return insufficient(`${T2_INSUFFICIENT_GAP} (feature_registry: ${msg})`);
  }

  // The exclusion list is applied HERE rather than in the query: the keys are
  // dotted, and a PostgREST `not.in.(a.b)` list needs quoting that is easy to
  // get silently wrong. The registry is dozens of rows, so filtering the read
  // costs nothing and the excluded keys travel into run_id either way.
  const excluded = new Set(k.t2ExcludedFeatureKeys);
  features = features.filter((f) => !excluded.has(f.feature_key));

  if (features.length === 0) return insufficient(T2_INSUFFICIENT_GAP, { eligible_features: 0 });

  // Paged for the same reason as feature_usage: one row per person per role
  // key, and a truncated roll would shrink the intended denominator silently.
  //
  // ORDERED BY A KEY THAT IS UNIQUE, NOT JUST user_id. Offset paging only
  // returns each row once if the sort is a TOTAL order: with 7,851 role rows
  // over 7,048 people, thousands of user_ids tie, and PostgreSQL is free to
  // order tied rows differently on each of the eight queries a page walk
  // makes — so a row can be returned twice and another never at all.
  // fn_adoption_person_roles UNIONs two branches whose non-key columns both
  // come from the same profiles row, so the UNION dedupes and (user_id, role)
  // is unique in its output: ordering on both makes the walk exact.
  const people: PersonRole[] = [];
  try {
    for (let from = 0; from < USAGE_MAX_ROWS; from += USAGE_PAGE) {
      const { data, error } = await admin
        .rpc('fn_adoption_person_roles')
        .order('user_id', { ascending: true })
        .order('role', { ascending: true })
        .range(from, from + USAGE_PAGE - 1);
      if (error) {
        return insufficient(`${T2_INSUFFICIENT_GAP} (fn_adoption_person_roles: ${error.message})`);
      }
      const page = (data ?? []) as PersonRole[];
      people.push(...page);
      if (page.length < USAGE_PAGE) break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return insufficient(`${T2_INSUFFICIENT_GAP} (fn_adoption_person_roles: ${msg})`);
  }

  if (people.length === 0) return insufficient(`${T2_INSUFFICIENT_GAP} (no active people on record)`);

  // One row per person × feature × day, so a week easily exceeds PostgREST's
  // row cap. Paged deliberately — a truncated read would report a real fall in
  // adoption that never happened.
  //
  // Ordered on the WHOLE primary key (user_id, feature_key, day), not on
  // user_id alone: one person using three features on five days is fifteen
  // rows sharing a user_id, and offset paging over a non-unique sort can skip
  // or repeat rows at every page boundary. feature_usage has no id column —
  // its primary key IS that triple — so the triple is the unique sort.
  const usage: UsageRow[] = [];
  try {
    const keys = features.map((f) => f.feature_key);
    for (let from = 0; from < USAGE_MAX_ROWS; from += USAGE_PAGE) {
      const { data, error } = await admin
        .from('feature_usage')
        .select('user_id, feature_key')
        .in('feature_key', keys)
        .gte('day', week.startDay)
        .lte('day', week.endDay)
        .order('user_id', { ascending: true })
        .order('feature_key', { ascending: true })
        .order('day', { ascending: true })
        .range(from, from + USAGE_PAGE - 1);
      if (error) return insufficient(`${T2_INSUFFICIENT_GAP} (feature_usage: ${error.message})`);
      const page = (data ?? []) as UsageRow[];
      usage.push(...page);
      if (page.length < USAGE_PAGE) break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return insufficient(`${T2_INSUFFICIENT_GAP} (feature_usage: ${msg})`);
  }

  const usersByRole = new Map<string, Set<string>>();
  const everyone = new Set<string>();
  for (const p of people) {
    everyone.add(p.user_id);
    if (!p.role) continue;
    if (!usersByRole.has(p.role)) usersByRole.set(p.role, new Set());
    usersByRole.get(p.role)!.add(p.user_id);
  }

  const usersByFeature = new Map<string, Set<string>>();
  for (const u of usage) {
    if (!usersByFeature.has(u.feature_key)) usersByFeature.set(u.feature_key, new Set());
    usersByFeature.get(u.feature_key)!.add(u.user_id);
  }

  const perFeature = features.map((f) => {
    const used = usersByFeature.get(f.feature_key) ?? new Set<string>();
    const roles = f.intended_roles && f.intended_roles.length > 0 ? f.intended_roles : ['all'];
    let bestPct = 0;
    let bestRole: string | null = null;
    for (const role of roles) {
      const intended = role === 'all' ? everyone : (usersByRole.get(role) ?? new Set<string>());
      if (intended.size === 0) continue;
      let active = 0;
      for (const uid of intended) if (used.has(uid)) active += 1;
      const pct = (active * 100) / intended.size;
      if (bestRole === null || pct > bestPct) {
        bestPct = pct;
        bestRole = role;
      }
    }
    return {
      feature_key: f.feature_key,
      best_role: bestRole,
      best_pct: bestRole === null ? null : Math.round(bestPct * 10) / 10,
      // A feature whose intended role matches NOBODY is not measurable: it is
      // neither used nor unused, so it cannot clear the bar.
      measurable: bestRole !== null,
    };
  });

  const measurable = perFeature.filter((f) => f.measurable);
  if (measurable.length === 0) {
    return insufficient(`${T2_INSUFFICIENT_GAP} (no feature has a role with anybody in it)`, {
      eligible_features: features.length,
    });
  }

  const usedCount = measurable.filter((f) => (f.best_pct ?? 0) >= k.t2UsedSharePct).length;
  const share = Math.round(((usedCount * 100) / measurable.length) * 10) / 10;

  return {
    loopKey: TOP_ADOPTION_SHARE_KEY,
    value: share,
    gap:
      `${share}% of shipped features were actually used in ${week.label}: ${usedCount} of ` +
      `${measurable.length} live features (shipped ${k.t2MinAgeDays}+ days ago, usage wired) reached ` +
      `at least ${k.t2UsedSharePct}% of an intended role. No bar yet.`,
    runId: JSON.stringify({
      ...base,
      measured: true,
      eligible_features: features.length,
      measurable_features: measurable.length,
      used_features: usedCount,
      share_pct: share,
      per_feature: perFeature,
    }),
  };
}

// ── The default Sentry reader (server-side token, never shipped to a client) ─

const SENTRY_API_BASE = 'https://sentry.io/api/0';

/**
 * Reads the week's user-facing production error groups.
 *
 * SENTRY_READ_TOKEN is the token the Director creates for this number.
 * SENTRY_AUTH_TOKEN is the read token production ALREADY holds (it is what
 * /api/cron/sentry-lane-2 runs on) and is used as a fallback so T1 is not dark
 * until a new secret is minted. Slugs default to the values that route has
 * used since 2026-04-27.
 */
export function createSentryReader(env: NodeJS.ProcessEnv = process.env): SentryReader {
  return async (week: IsoWeek): Promise<SentryReadResult> => {
    const token = env.SENTRY_READ_TOKEN || env.SENTRY_AUTH_TOKEN;
    // Recorded with the measurement, so a reading taken on the fallback is
    // never mistaken later for one taken on the dedicated read-only secret.
    const tokenSource: SentryTokenSource = env.SENTRY_READ_TOKEN
      ? 'SENTRY_READ_TOKEN'
      : env.SENTRY_AUTH_TOKEN
        ? 'SENTRY_AUTH_TOKEN (fallback)'
        : 'none';
    if (!token) return { error: 'SENTRY_READ_TOKEN not set', tokenSource };

    const org = env.SENTRY_ORG || env.SENTRY_ORG_SLUG || 'jkkn-em';
    const project = env.SENTRY_PROJECT || env.SENTRY_PROJECT_SLUG || 'javascript-nextjs';
    const environment = env.SENTRY_ENVIRONMENT || 'vercel-production';

    const url =
      `${SENTRY_API_BASE}/projects/${org}/${project}/issues/` +
      `?statsPeriod=&start=${encodeURIComponent(week.startUtc.toISOString())}` +
      `&end=${encodeURIComponent(week.endUtc.toISOString())}&utc=true` +
      `&environment=${encodeURIComponent(environment)}` +
      `&query=${encodeURIComponent('is:unresolved')}&limit=100`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        return { error: `Sentry read failed: HTTP ${res.status} ${body}`, tokenSource };
      }
      const groups = (await res.json()) as SentryGroup[];
      if (!Array.isArray(groups)) {
        return { error: 'Sentry read failed: unexpected response shape', tokenSource };
      }
      return { groups, tokenSource };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Sentry read failed: ${msg}`, tokenSource };
    }
  };
}
