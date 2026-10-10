/**
 * The CCTV report kinds — kept apart from lib/campus-walk/cctv.ts so the
 * browser form can import them without pulling in server code.
 */

/**
 * Four kinds, each with its own routing rule. A code constant, not a master
 * table: adding a kind means adding a routing rule, which is code anyway, and
 * the walk screen's own CATEGORIES list is a constant for the same reason.
 */
export const CCTV_CATEGORIES = [
  { key: 'learner_conduct', label: 'Learners — conduct in class or library' },
  { key: 'power_left_on', label: 'Fans or lights left on in an empty room' },
  { key: 'staff_conduct', label: 'Team members — conduct on duty' },
  { key: 'exam_copying', label: 'Exam copying' }
] as const;

export type CctvCategory = (typeof CCTV_CATEGORIES)[number]['key'];

export function isCctvCategory(v: unknown): v is CctvCategory {
  return CCTV_CATEGORIES.some((c) => c.key === v);
}

export function cctvCategoryLabel(key: string | null | undefined): string {
  return CCTV_CATEGORIES.find((c) => c.key === key)?.label ?? 'CCTV report';
}

// ── Working days (Director, 9 Oct 2026 edge-case interview) ─────────────────
// The HOD's "1 day" is a WORKING day: Sundays do not count. A report filed on
// Saturday is due on Monday, and the climb to the principal counts only
// working days late. College holidays are not counted here (no maintained
// holiday calendar is read); see the PR for that follow-up.

function utcDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** YYYY-MM-DD, `days` working days after `fromIso` (Sundays skipped). 0 = the same day. */
export function addWorkingDays(fromIso: string, days: number): string {
  const d = utcDay(fromIso);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** Whole working days (Sundays skipped) from `dueIso` to `todayIso`; 0 when not late. */
export function workingDaysPastDue(dueIso: string, todayIso: string): number {
  const due = utcDay(dueIso);
  const today = utcDay(todayIso);
  if (!(today > due)) return 0;
  let n = 0;
  const d = new Date(due);
  while (d < today) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) n++;
  }
  return n;
}

/**
 * Reply-quality check (Director, 9 Oct 2026): a reply must name an action.
 * Returns a plain-English reason when the reply is too thin to close the
 * report, else null.
 */
const NON_ACTION_REPLIES = new Set([
  'noted', 'ok', 'okay', 'seen', 'will check', 'will do', 'will see', 'checked', 'done', 'informed',
  'will inform', 'acknowledged', 'received', 'sure', 'yes', 'fine', 'will take action', 'action will be taken'
]);

export function thinReplyReason(reply: string): string | null {
  const t = reply.trim();
  const bare = t.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (NON_ACTION_REPLIES.has(bare)) {
    return `"${t}" does not say what was done. Write the action, e.g. "Spoke to the class; phones are now collected at the start of the hour."`;
  }
  if (t.length < 20) return 'Please say in a full sentence what action was taken.';
  return null;
}
