// Group an attendance roster by the learner's OWN college.
//
// A session can be shared with other colleges (event_session_institutions,
// Director decision D2). Once visiting learners appear on a roster, a flat list
// gives the coordinator no way to tell whose learner is whose — and the mark
// itself is now filed under the learner's college, so the screen has to agree
// with the record.
//
// Shared by attendance-dialog and day-attendance-dialog, which render the same
// roster shape from two different RPCs.

export interface CollegeGroup<T> {
  /** Stable React key. */
  key: string;
  /** College name, or a placeholder when the learner has none recorded. */
  label: string;
  rows: T[];
}

const NO_COLLEGE = 'No college recorded';

/** Groups rows by college, alphabetically, with the "no college" bucket last.
 *  A single group means every learner is from one college — the caller should
 *  then render the list flat, exactly as before, rather than showing a heading
 *  that tells the reader nothing. */
export function groupRosterByCollege<T extends { institution_name: string | null }>(
  rows: T[],
): CollegeGroup<T>[] {
  const byLabel = new Map<string, T[]>();
  for (const row of rows) {
    const label = row.institution_name?.trim() || NO_COLLEGE;
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(row);
    else byLabel.set(label, [row]);
  }

  return [...byLabel.entries()]
    .sort(([a], [b]) => {
      if (a === NO_COLLEGE) return 1;
      if (b === NO_COLLEGE) return -1;
      return a.localeCompare(b);
    })
    .map(([label, groupRows]) => ({ key: label, label, rows: groupRows }));
}
