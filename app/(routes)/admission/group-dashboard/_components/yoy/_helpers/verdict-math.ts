import type { YoYTrajectoryRow } from '@/lib/services/admission/yoy-trajectory-service';

export type Verdict = {
  /** The prior year being compared against (e.g. 2025 means "vs 2025-26"). */
  priorYear: number;
  /** Current year's cumulative at current day-N (today). */
  currentValue: number;
  /** Prior year's cumulative at the SAME day-N. */
  priorValue: number;
  /** currentValue - priorValue. Negative = behind, positive = ahead. */
  delta: number;
  /** delta / priorValue × 100 (clamped to ±999). */
  deltaPct: number;
  /** 'behind' | 'on-par' | 'ahead'. on-par when |deltaPct| < 2. */
  direction: 'behind' | 'on-par' | 'ahead';
  /** The day-N at which the comparison is made (= current year's max dayN). */
  comparedAtDayN: number;
};

/**
 * For each prior year in the trajectory, compute the lag/ahead verdict
 * comparing the current year's cumulative at its CURRENT day-N against
 * each prior year's cumulative at the SAME day-N.
 *
 * Returns one verdict per prior year, sorted oldest-first.
 *
 * Director-locked primary question: "Am I behind compared to previous years
 * THIS year?" — the verdict.deltaPct and verdict.delta are the answer.
 */
export function computeVerdicts(trajectory: YoYTrajectoryRow[]): Verdict[] {
  if (!trajectory.length) return [];

  const yearsSet = new Set<number>();
  for (const r of trajectory) yearsSet.add(r.year);
  const years = Array.from(yearsSet).sort((a, b) => a - b);
  if (years.length < 2) return [];

  const currentYear = years[years.length - 1];
  const priorYears = years.slice(0, -1);

  // Find current year's MAX day-N (i.e. today's position in cycle)
  const currentRows = trajectory.filter((r) => r.year === currentYear);
  if (!currentRows.length) return [];
  const currentMaxDayN = currentRows.reduce((m, r) => Math.max(m, r.dayN), -Infinity);
  const currentValue = currentRows
    .filter((r) => r.dayN === currentMaxDayN)
    .reduce((m, r) => Math.max(m, r.cumulativeAdmitted), 0);

  return priorYears.map((priorYear) => {
    // Get prior year's cumulative AT THE SAME day-N as current.
    // If prior year has no exact row at that day-N, fall back to the last
    // row at or before that day-N (forward-fill — same as the chart line).
    const priorRows = trajectory
      .filter((r) => r.year === priorYear && r.dayN <= currentMaxDayN)
      .sort((a, b) => b.dayN - a.dayN);
    const priorValue = priorRows.length ? priorRows[0].cumulativeAdmitted : 0;
    const delta = currentValue - priorValue;
    const rawPct = priorValue > 0 ? (delta / priorValue) * 100 : 0;
    const deltaPct = Math.max(-999, Math.min(999, rawPct));

    let direction: Verdict['direction'];
    if (Math.abs(deltaPct) < 2) direction = 'on-par';
    else if (deltaPct < 0) direction = 'behind';
    else direction = 'ahead';

    return {
      priorYear,
      currentValue,
      priorValue,
      delta,
      deltaPct,
      direction,
      comparedAtDayN: currentMaxDayN,
    };
  });
}

/**
 * Cycle label: "2024-25" given year=2024. Used in headers + verdict copy.
 */
export function cycleLabel(year: number): string {
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

export type ProjectionVerdict = {
  /** Projected final cumulative for the current cycle */
  projected: number;
  /** Prior cycle's actual final cumulative */
  priorFinal: number;
  /** projected - priorFinal */
  delta: number;
  /** % delta */
  deltaPct: number;
  /** Direction based on delta */
  direction: 'behind' | 'on-par' | 'ahead';
};

/**
 * Project current cycle's final cumulative by scaling current value by the
 * prior cycle's full-cycle / same-day-N ratio. This assumes current cycle
 * follows a similar shape to last cycle from this point forward.
 *
 * Returns null if we don't have enough data to project.
 */
export function computeProjectionVerdict(trajectory: YoYTrajectoryRow[]): ProjectionVerdict | null {
  if (!trajectory.length) return null;
  const yearsSet = new Set<number>();
  for (const r of trajectory) yearsSet.add(r.year);
  const years = Array.from(yearsSet).sort((a, b) => a - b);
  if (years.length < 2) return null;
  const currentYear = years[years.length - 1];
  const priorYear = years[years.length - 2];

  const currentRows = trajectory.filter((r) => r.year === currentYear);
  if (!currentRows.length) return null;
  const currentMaxDayN = currentRows.reduce((m, r) => Math.max(m, r.dayN), -Infinity);
  const currentValue = currentRows
    .filter((r) => r.dayN === currentMaxDayN)
    .reduce((m, r) => Math.max(m, r.cumulativeAdmitted), 0);

  const priorRows = trajectory.filter((r) => r.year === priorYear);
  if (!priorRows.length) return null;
  const priorAtSameDay = priorRows
    .filter((r) => r.dayN <= currentMaxDayN)
    .sort((a, b) => b.dayN - a.dayN)[0]?.cumulativeAdmitted ?? 0;
  const priorFinal = priorRows.reduce((m, r) => Math.max(m, r.cumulativeAdmitted), 0);

  if (priorAtSameDay <= 0 || priorFinal <= 0) return null;

  const projected = Math.round(currentValue * (priorFinal / priorAtSameDay));
  const delta = projected - priorFinal;
  const deltaPct = priorFinal > 0 ? (delta / priorFinal) * 100 : 0;

  let direction: ProjectionVerdict['direction'];
  if (Math.abs(deltaPct) < 2) direction = 'on-par';
  else if (deltaPct < 0) direction = 'behind';
  else direction = 'ahead';

  return { projected, priorFinal, delta, deltaPct, direction };
}

export type WeekPaceVerdict = {
  /** Admissions in the last 7 days of the current cycle */
  thisWeek: number;
  /** Admissions in the matching window last year */
  sameWeekLastYear: number;
  delta: number;
  deltaPct: number;
  direction: 'behind' | 'on-par' | 'ahead';
};

/**
 * Compare admissions/day pace in the last 7 days of current cycle vs the
 * matching day-N window of the prior cycle.
 *
 * Returns null if either window has no data.
 */
export function computeWeekPaceVerdict(trajectory: YoYTrajectoryRow[]): WeekPaceVerdict | null {
  if (!trajectory.length) return null;
  const yearsSet = new Set<number>();
  for (const r of trajectory) yearsSet.add(r.year);
  const years = Array.from(yearsSet).sort((a, b) => a - b);
  if (years.length < 2) return null;
  const currentYear = years[years.length - 1];
  const priorYear = years[years.length - 2];

  const currentRows = trajectory.filter((r) => r.year === currentYear);
  if (!currentRows.length) return null;
  const currentMaxDayN = currentRows.reduce((m, r) => Math.max(m, r.dayN), -Infinity);
  const weekStartDayN = currentMaxDayN - 7;

  const cumAt = (year: number, dayN: number): number => {
    const rows = trajectory
      .filter((r) => r.year === year && r.dayN <= dayN)
      .sort((a, b) => b.dayN - a.dayN);
    return rows[0]?.cumulativeAdmitted ?? 0;
  };

  const thisWeek = cumAt(currentYear, currentMaxDayN) - cumAt(currentYear, weekStartDayN);
  const sameWeekLastYear = cumAt(priorYear, currentMaxDayN) - cumAt(priorYear, weekStartDayN);

  const delta = thisWeek - sameWeekLastYear;
  const deltaPct = sameWeekLastYear > 0 ? (delta / sameWeekLastYear) * 100 : 0;

  let direction: WeekPaceVerdict['direction'];
  if (Math.abs(deltaPct) < 5) direction = 'on-par';
  else if (deltaPct < 0) direction = 'behind';
  else direction = 'ahead';

  return { thisWeek, sameWeekLastYear, delta, deltaPct, direction };
}
