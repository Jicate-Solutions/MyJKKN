// Counts behind the stat cards on /my-bug-reports.
//
// BUG-003465: the "In Progress" card added only `in_progress` + `seen`. A
// report nobody has opened yet (`new`) was inside "Total Reports" but in no
// other card, so a reporter's still-open reports looked like they had
// vanished. `open` is every report not yet closed one way or another
// (new + seen + in_progress), and that is what the card shows.

import type { BugReportStatus } from '@/types/bugs';

export interface MyBugReportStats {
  total: number;
  new: number;
  seen: number;
  inProgress: number;
  /** Not yet resolved, won't-fix or duplicate: new + seen + in_progress. */
  open: number;
  resolved: number;
  wontFix: number;
  successRate: number;
}

export function computeMyBugReportStats(
  reports: ReadonlyArray<{ status: BugReportStatus | string | null }> | null | undefined
): MyBugReportStats {
  const list = reports ?? [];
  const count = (s: BugReportStatus) => list.filter((r) => r.status === s).length;

  const total = list.length;
  const fresh = count('new');
  const seen = count('seen');
  const inProgress = count('in_progress');
  const resolved = count('resolved');

  return {
    total,
    new: fresh,
    seen,
    inProgress,
    open: fresh + seen + inProgress,
    resolved,
    wontFix: count('wont_fix'),
    successRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
  };
}
