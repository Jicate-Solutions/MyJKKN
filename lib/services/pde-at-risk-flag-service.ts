// =====================================================================
// PDE at-risk flag sweep — the active half of /pde/admin/at-risk
// =====================================================================
// The admin surface reads the VIEW `pde_at_risk_learners`, which recomputes
// risk live on every page load and persists nothing. This service is the
// pipeline half: it reads the same view, resolves each flagged learner's
// institution, and appends ONE durable row per learner per UTC day to
// `pde_at_risk_log` — so "when was this learner first flagged?" and
// "how long have they been flagged?" become answerable, and staff can be
// told when a learner NEWLY crosses the line.
//
// Deliberate shape decisions:
//
//   ONE ROW PER LEARNER PER DAY, not per (learner, course). The view is
//   grained per (learner, course); a learner struggling in three courses is
//   three view rows. Logging all three would make "days flagged" count runs
//   instead of days. We keep the WORST band, record its course_id, and put
//   the full per-course breakdown in metric_snapshot. The unique index
//   pde_at_risk_log(learner_id, flag_date) enforces this in the DB too.
//
//   NEW FLAGS ONLY drive notification. `newFlags` excludes anything that
//   already had a row today (dedup) AND anything with prior history — a
//   learner flagged yesterday and again today is CONTINUING, not new. The
//   cron notifies on `newlyAtRisk` so the six-hourly cadence does not page
//   staff about the same learner four times a day forever.
//
//   institution_id is NOT NULL in the log. PDE tables predate the
//   institution-scoping convention and carry no institution_id, so it is
//   resolved from profiles.institution_id here. A learner whose profile has
//   no institution is SKIPPED and counted in `skippedNoInstitution` rather
//   than written unscoped — an unscoped row would escape
//   role_has_institution_access() in the table's RLS.
//
// Companion cron: app/api/cron/pde-at-risk-flag/route.ts (every 6h).
// =====================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Bands the view emits. 'on_track' is not a flag and is never logged. */
export const FLAGGABLE_RISK_LEVELS = ['critical', 'warning', 'struggling'] as const;
export type FlaggableRiskLevel = (typeof FLAGGABLE_RISK_LEVELS)[number];

/** Triage order — lower is worse. Used to pick a learner's worst course row. */
const RISK_SEVERITY: Record<FlaggableRiskLevel, number> = {
  critical: 0,
  warning: 1,
  struggling: 2,
};

/** One row as it comes off the `pde_at_risk_learners` view. */
export interface AtRiskViewRow {
  learner_id: string | null;
  course_id: string | null;
  full_name: string | null;
  email: string | null;
  last_active_date: string | null;
  days_inactive: number | null;
  avg_score: number | null;
  total_time: number | null;
  total_lessons_completed: number | null;
  risk_level: string | null;
}

/** A learner reduced to their single worst view row, plus the breakdown. */
export interface WorstPerLearner {
  learner_id: string;
  course_id: string | null;
  full_name: string | null;
  risk_level: FlaggableRiskLevel;
  days_inactive: number | null;
  avg_score: number | null;
  last_active_date: string | null;
  total_time: number | null;
  total_lessons_completed: number | null;
  courses_flagged: number;
  course_ids: string[];
}

export interface NewFlag {
  learner_id: string;
  full_name: string | null;
  risk_level: FlaggableRiskLevel;
  institution_id: string;
  days_inactive: number | null;
}

export interface AtRiskSweepResult {
  /** Distinct learners the view reported in a flaggable band. */
  evaluated: number;
  /** Rows written to pde_at_risk_log this run. */
  flagged: number;
  /** Already had a row for this UTC day — nothing written. */
  duplicatesSkipped: number;
  /** profiles.institution_id was null — deliberately not written. */
  skippedNoInstitution: number;
  /** Newly flagged (written AND no prior history) — the notification set. */
  newlyAtRisk: NewFlag[];
  /** The UTC day this sweep wrote under. */
  flagDate: string;
  /** Per-learner failures; the sweep continues past them. */
  errors: Array<{ learner_id: string; message: string }>;
}

/** Today's date in UTC as YYYY-MM-DD. Vercel functions run UTC. */
export function utcFlagDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isFlaggableRiskLevel(value: string | null): value is FlaggableRiskLevel {
  return value !== null && (FLAGGABLE_RISK_LEVELS as readonly string[]).includes(value);
}

/**
 * Collapse the per-(learner, course) view rows down to one entry per learner,
 * keeping the worst band. Ties break on the higher days_inactive, so between
 * two 'warning' courses the staler one is the one recorded.
 *
 * Exported for unit testing — this is the only real judgment in the sweep.
 */
export function reduceToWorstPerLearner(rows: AtRiskViewRow[]): WorstPerLearner[] {
  const byLearner = new Map<string, WorstPerLearner>();

  for (const row of rows) {
    if (!row.learner_id) continue;
    if (!isFlaggableRiskLevel(row.risk_level)) continue;

    const existing = byLearner.get(row.learner_id);
    const candidate: WorstPerLearner = {
      learner_id: row.learner_id,
      course_id: row.course_id,
      full_name: row.full_name,
      risk_level: row.risk_level,
      days_inactive: row.days_inactive,
      avg_score: row.avg_score,
      last_active_date: row.last_active_date,
      total_time: row.total_time,
      total_lessons_completed: row.total_lessons_completed,
      courses_flagged: 1,
      course_ids: row.course_id ? [row.course_id] : [],
    };

    if (!existing) {
      byLearner.set(row.learner_id, candidate);
      continue;
    }

    const merged: WorstPerLearner = {
      ...existing,
      courses_flagged: existing.courses_flagged + 1,
      course_ids: row.course_id
        ? Array.from(new Set([...existing.course_ids, row.course_id]))
        : existing.course_ids,
    };

    const isWorse =
      RISK_SEVERITY[candidate.risk_level] < RISK_SEVERITY[existing.risk_level] ||
      (RISK_SEVERITY[candidate.risk_level] === RISK_SEVERITY[existing.risk_level] &&
        (candidate.days_inactive ?? 0) > (existing.days_inactive ?? 0));

    byLearner.set(
      row.learner_id,
      isWorse
        ? {
            ...candidate,
            courses_flagged: merged.courses_flagged,
            course_ids: merged.course_ids,
          }
        : merged,
    );
  }

  return Array.from(byLearner.values());
}

/**
 * Run the sweep. Never throws for a single bad learner — per-learner failures
 * are collected in `errors` and the rest of the sweep continues, so one broken
 * profile cannot silently drop the whole day's history.
 *
 * `supabase` MUST be a service-role client: pde_at_risk_log grants no write
 * policy to `authenticated` by design.
 */
export async function runAtRiskFlagSweep(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<AtRiskSweepResult> {
  const flagDate = utcFlagDate(now);
  const errors: AtRiskSweepResult['errors'] = [];

  // 1. Read the live view — the SAME source /pde/admin/at-risk renders from,
  //    so the log can never disagree with the page about who is at risk.
  const { data: viewRows, error: viewErr } = await supabase
    .from('pde_at_risk_learners')
    .select(
      'learner_id, course_id, full_name, email, last_active_date, days_inactive, avg_score, total_time, total_lessons_completed, risk_level',
    )
    .in('risk_level', FLAGGABLE_RISK_LEVELS as unknown as string[]);

  if (viewErr) {
    throw new Error(`pde_at_risk_learners read failed: ${viewErr.message}`);
  }

  const worst = reduceToWorstPerLearner((viewRows ?? []) as AtRiskViewRow[]);
  if (worst.length === 0) {
    return {
      evaluated: 0,
      flagged: 0,
      duplicatesSkipped: 0,
      skippedNoInstitution: 0,
      newlyAtRisk: [],
      flagDate,
      errors,
    };
  }

  const learnerIds = worst.map((w) => w.learner_id);

  // 2. Resolve institution scope. PDE tables carry none; profiles do.
  const { data: profileRows, error: profileErr } = await supabase
    .from('profiles')
    .select('id, institution_id')
    .in('id', learnerIds);

  if (profileErr) {
    throw new Error(`profiles read failed: ${profileErr.message}`);
  }

  const institutionByLearner = new Map<string, string | null>();
  for (const p of (profileRows ?? []) as Array<{ id: string; institution_id: string | null }>) {
    institutionByLearner.set(p.id, p.institution_id);
  }

  // 3. Dedup pre-check: who already has a row for this UTC day?
  const { data: todayRows, error: todayErr } = await supabase
    .from('pde_at_risk_log')
    .select('learner_id')
    .eq('flag_date', flagDate)
    .in('learner_id', learnerIds);

  if (todayErr) {
    throw new Error(`pde_at_risk_log dedup read failed: ${todayErr.message}`);
  }
  const alreadyFlaggedToday = new Set(
    ((todayRows ?? []) as Array<{ learner_id: string }>).map((r) => r.learner_id),
  );

  // 4. Prior history: a learner with an earlier flag is CONTINUING, not new.
  //    Only genuinely new crossings are worth paging staff about.
  const { data: priorRows, error: priorErr } = await supabase
    .from('pde_at_risk_log')
    .select('learner_id')
    .lt('flag_date', flagDate)
    .in('learner_id', learnerIds);

  if (priorErr) {
    throw new Error(`pde_at_risk_log history read failed: ${priorErr.message}`);
  }
  const hasPriorHistory = new Set(
    ((priorRows ?? []) as Array<{ learner_id: string }>).map((r) => r.learner_id),
  );

  // 5. Write.
  let flagged = 0;
  let duplicatesSkipped = 0;
  let skippedNoInstitution = 0;
  const newlyAtRisk: NewFlag[] = [];

  for (const w of worst) {
    if (alreadyFlaggedToday.has(w.learner_id)) {
      duplicatesSkipped++;
      continue;
    }

    const institutionId = institutionByLearner.get(w.learner_id) ?? null;
    if (!institutionId) {
      skippedNoInstitution++;
      continue;
    }

    const { error: insertErr } = await supabase.from('pde_at_risk_log').insert({
      learner_id: w.learner_id,
      course_id: w.course_id,
      institution_id: institutionId,
      flag_date: flagDate,
      risk_level: w.risk_level,
      days_inactive: w.days_inactive,
      avg_score: w.avg_score,
      metric_snapshot: {
        last_active_date: w.last_active_date,
        total_time: w.total_time,
        total_lessons_completed: w.total_lessons_completed,
        courses_flagged: w.courses_flagged,
        course_ids: w.course_ids,
      },
    });

    if (insertErr) {
      // 23505 = the (learner_id, flag_date) unique index fired, i.e. a
      // concurrent/overlapping run beat us to it. That is a duplicate, not a
      // failure — the day's history is intact either way.
      if ((insertErr as { code?: string }).code === '23505') {
        duplicatesSkipped++;
        continue;
      }
      errors.push({ learner_id: w.learner_id, message: insertErr.message });
      continue;
    }

    flagged++;
    if (!hasPriorHistory.has(w.learner_id)) {
      newlyAtRisk.push({
        learner_id: w.learner_id,
        full_name: w.full_name,
        risk_level: w.risk_level,
        institution_id: institutionId,
        days_inactive: w.days_inactive,
      });
    }
  }

  return {
    evaluated: worst.length,
    flagged,
    duplicatesSkipped,
    skippedNoInstitution,
    newlyAtRisk,
    flagDate,
    errors,
  };
}
