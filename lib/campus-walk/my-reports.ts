/**
 * Campus Walk — how a report reads to the person who filed it.
 *
 * Pure functions, no database, shared by the "My reports" page
 * (app/(routes)/instasolver/my-reports) and the "Not fixed" route
 * (app/api/campus-walk/not-fixed/route.ts) so the button on screen and the
 * rule that enforces it can never disagree about the 7-day window.
 */

/** How long after closure the reporter may still say "Not fixed" (Director, 2026-09-30). */
export const NOT_FIXED_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

export type ReportStatus = 'open' | 'being_checked' | 'fixed' | 'reopened' | 'cancelled' | 'closed';

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Open',
  being_checked: 'Fix sent — being checked',
  fixed: 'Fixed',
  reopened: 'Reopened',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

/** True while a closed job is still inside the reporter's "Not fixed" window. */
export function withinNotFixedWindow(completedAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!completedAt) return false;
  const t = Date.parse(completedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= NOT_FIXED_WINDOW_DAYS * DAY_MS;
}

export function reportStatusOf(row: {
  status_key: string;
  metadata: Record<string, any> | null;
}): ReportStatus {
  if (row.status_key === 'done') return 'fixed';
  if (row.status_key === 'cancelled') return 'cancelled';
  if (row.status_key === 'archived') return 'closed';
  // Rows that were already waiting in the old approval queue on 2026-09-30.
  if (row.status_key === 'review') return 'being_checked';
  if ((row.metadata ?? {}).fix?.approval?.reopened_by_reporter === true) return 'reopened';
  return 'open';
}

/** The "Not fixed" button shows only on a job fixed within the window. */
export function canSayNotFixed(
  row: { status_key: string; completed_at: string | null },
  nowMs: number = Date.now()
): boolean {
  return row.status_key === 'done' && withinNotFixedWindow(row.completed_at, nowMs);
}

// ── Stars and thanks (Director, 2026-09-30) ──────────────────────────────────
// After a fix the reporter can give 1–5 stars and an optional one-line thanks.
// One rating per reporter per FIX ROUND: a job reopened with "Not fixed" and
// fixed again is a new round and can be rated again. The rows live in
// public.campus_walk_task_ratings (UNIQUE task_id, fix_round_key, reporter).

/** Longest thank-you line, matching the table's CHECK constraint. */
export const THANKS_MAX = 200;

/** What an unsigned thank-you calls the person who sent it. */
export const ANONYMOUS_THANKER = 'Someone';

/**
 * The fix round a rating belongs to: the fix photo.
 *
 * The SAME fallback order as reporterFixedIdempotencyKey() in
 * lib/campus-walk/closure.ts (attachment_id → storage_path → submitted_at →
 * 'legacy'), so "the photo the reporter was told about" and "the photo the
 * reporter rated" are always the same thing. Kept here, not imported, because
 * this file stays free of database imports for the page and the tests.
 */
export function fixRoundKeyOf(metadata: Record<string, any> | null | undefined): string {
  const fix = (metadata ?? {}).fix ?? {};
  return (
    (typeof fix.attachment_id === 'string' && fix.attachment_id) ||
    (typeof fix.storage_path === 'string' && fix.storage_path) ||
    (typeof fix.submitted_at === 'string' && fix.submitted_at) ||
    'legacy'
  );
}

/** A fixed job — status done AND its fix photo accepted — is rateable. */
export function isRateableFix(row: { status_key: string; metadata: Record<string, any> | null }): boolean {
  return row.status_key === 'done' && (row.metadata ?? {}).fix?.approval?.state === 'approved';
}

/** Whole stars 1–5, or null for anything else. */
export function parseStars(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

/** One line, trimmed, capped. Empty becomes null. */
export function cleanThanks(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const one = value.replace(/\s+/g, ' ').trim().slice(0, THANKS_MAX);
  return one ? one : null;
}

/**
 * Who the fixer is told thanked them.
 *
 * Unsigned → "Someone", always, whatever names are available. Signed → the
 * reporter's name, "from <department>" when the reporter belongs to one. A
 * signed rating with no name on record still falls back to "Someone" rather
 * than an empty string.
 */
export function thankerLabel(opts: {
  signed: boolean;
  reporterName?: string | null;
  reporterDepartment?: string | null;
}): string {
  if (!opts.signed) return ANONYMOUS_THANKER;
  const name = (opts.reporterName ?? '').trim();
  if (!name) return ANONYMOUS_THANKER;
  const dept = (opts.reporterDepartment ?? '').trim();
  return dept ? `${name} from ${dept}` : name;
}

/**
 * The bell the FIXER receives. It names the fixer personally (the ruling), and
 * names the reporter only when they signed. Pure, so the naming rule is tested
 * without a database.
 */
export function buildThanksBell(opts: {
  fixerName?: string | null;
  signed: boolean;
  reporterName?: string | null;
  reporterDepartment?: string | null;
  taskTitle: string;
  place?: string | null;
  stars: number;
  thanks?: string | null;
}): { title: string; body: string } {
  const who = thankerLabel(opts);
  const fixer = (opts.fixerName ?? '').trim();
  const what = String(opts.taskTitle || 'a campus job').slice(0, 100);
  const where = (opts.place ?? '').trim();
  const job = `“${what}”${where ? ` in ${where}` : ''}`;
  const starsText = `${opts.stars} of 5 stars`;

  const title = fixer ? `Thank you, ${fixer}` : 'Thank you for the fix';
  const lead = fixer ? `${fixer}, ${who} thanked you` : `${who} thanked you`;
  const quote = opts.thanks ? ` They said: “${opts.thanks}”` : '';
  return { title, body: `${lead} for fixing ${job} and gave it ${starsText}.${quote}` };
}
