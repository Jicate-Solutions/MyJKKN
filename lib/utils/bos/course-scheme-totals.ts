// Semester-total arithmetic for the Course Scheme (/bos/course-scheme).
//
// Courses that share a `group_order` (COE column `course_mapping.group_order`)
// are elective alternatives: the learner takes exactly ONE of them. So a group
// must contribute a single course's worth to every semester total — credits,
// L / T / P hours, and max marks alike — even though every option is printed.
// Note group_order usually equals the row's own course order, so standalone
// courses form singleton "groups" — numerically identical to counting them
// on their own; only rows genuinely sharing a number collapse to one count.
//
// Both the on-screen semester table and the "Download Report" PDF compute totals
// from here so the screen and the printed scheme can never disagree.

/** Minimal flat shape the totals math needs. Callers adapt their own row type. */
export interface SchemeTotalRow {
  group_order?: number | null;
  credit?: number | null;
  theory_hours?: number | null;
  tutorial_hours?: number | null;
  practical_hours?: number | null;
  total_max_mark?: number | null;
}

export interface SchemeTotals {
  credits: number;
  theory: number;
  tutorial: number;
  practical: number;
  marks: number;
  /** L + T + P — the "final total" hours column. */
  hours: number;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Normalised group key; '' means "not grouped" (counts on its own). */
export const groupKeyOf = (row: SchemeTotalRow): string =>
  row.group_order != null ? String(row.group_order) : '';

/**
 * The one row that speaks for its group: highest credit wins, ties keep the
 * first-listed option. Using a single representative (rather than max-per-column)
 * keeps the totals internally consistent — the counted credits, hours and marks
 * all belong to the same real course.
 */
export function pickGroupRepresentative<T extends SchemeTotalRow>(rows: T[]): T {
  return rows.reduce((best, r) => (num(r.credit) > num(best.credit) ? r : best));
}

/**
 * Semester totals with grouped courses collapsed to one count each.
 * Ungrouped rows each contribute their own values.
 */
export function computeSchemeTotals(rows: SchemeTotalRow[]): SchemeTotals {
  // Preserve first-appearance order so the representative tie-break is stable.
  const groups = new Map<string, SchemeTotalRow[]>();
  const counted: SchemeTotalRow[] = [];

  for (const row of rows) {
    const key = groupKeyOf(row);
    if (!key) {
      counted.push(row);
      continue;
    }
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else {
      groups.set(key, [row]);
      // Placeholder — swapped for the representative once the group is complete.
      counted.push(row);
    }
  }

  // Resolve each group's placeholder to its representative.
  const representatives = new Map<string, SchemeTotalRow>();
  for (const [key, members] of groups) {
    representatives.set(key, pickGroupRepresentative(members));
  }

  const totals = counted.reduce<SchemeTotals>(
    (acc, placeholder) => {
      const key = groupKeyOf(placeholder);
      const row = key ? (representatives.get(key) ?? placeholder) : placeholder;
      acc.credits += num(row.credit);
      acc.theory += num(row.theory_hours);
      acc.tutorial += num(row.tutorial_hours);
      acc.practical += num(row.practical_hours);
      acc.marks += num(row.total_max_mark);
      return acc;
    },
    { credits: 0, theory: 0, tutorial: 0, practical: 0, marks: 0, hours: 0 },
  );

  totals.hours = totals.theory + totals.tutorial + totals.practical;
  return totals;
}
