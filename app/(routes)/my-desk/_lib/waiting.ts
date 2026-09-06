// app/(routes)/my-desk/_lib/waiting.ts
// ============================================================================
// "Waiting on you" — the words and the ordering, with no React and no Supabase.
//
// The section on /my-desk lists everything the database has COMPUTED to be
// waiting on the signed-in person: hires to sign off, refunds to approve,
// leave to approve, meeting triggers to decide, grievances to assign, hires to
// bring on board (salary agreed, onboarding not started). The
// computing happens in one RPC, fn_my_desk_waiting(); nothing here re-derives a
// queue. This file only decides what a person reads off the result.
//
// THE ONE RULE, borrowed from ./desk.ts (readabilityVerdict):
//
//   The page may not say "nothing is waiting on you" unless it actually
//   checked. A failed call — including the call failing because the function
//   has not been installed yet — is a "could not check", never an empty list.
//   Zero rows from a call that succeeded is an empty list, and the sentence
//   for it names WHAT was checked and WHEN, so the reader can tell a real
//   all-clear from a section that simply did not load.
//
// Everything exported here is a pure function of its arguments, so the test
// file can state what a person sees against hand-written rows.
// ============================================================================

/** The queues the RPC knows how to compute. Order here is only the fallback. */
export const WAITING_SOURCES = [
  'recruitment',
  'refund',
  'leave',
  'meeting_trigger',
  'grievance',
  // Appended, never inserted: this list also fixes the order the "checked N
  // queues (…)" sentence reads in, and an addition must not re-word the five
  // that were already there.
  'offer',
] as const;

export type WaitingSource = (typeof WAITING_SOURCES)[number];

/**
 * One row of fn_my_desk_waiting() (migration 20261018030000, which supersedes
 * 20261018020000), exactly as the contract names it:
 *   RETURNS TABLE(source text, item_id uuid, title text, detail text,
 *                 amount numeric, waiting_since timestamptz, age_days integer,
 *                 href text)   ORDER BY waiting_since ASC   LIMIT 500
 * `amount` is RUPEES (numeric), never paise. `href` is one of
 * /hr/recruitment/approvals · /billing/refunds · /hr/leave/approvals ·
 * /meetings/triggers · /learners-council/issues ·
 * /hr/recruitment/approvals/<job_id> — or /hr/recruitment/candidates/<id> when
 * the candidate carries no job_id (the only per-row href, used by `offer`).
 */
export interface WaitingRow {
  source: WaitingSource | string;
  item_id: string;
  title: string;
  detail: string;
  amount: number | null;
  /** ISO timestamp — when the item started waiting on this person. */
  waiting_since: string;
  /** The database's own floor((now() - waiting_since) / 1 day). A FALLBACK only — see rowAgeDays. */
  age_days: number;
  /** The module page where the action already exists. */
  href: string;
}

/** The RPC caps its answer here (LIMIT 500, no truncation flag); at the cap, the list is a floor. */
export const WAITING_ROW_CAP = 500;

/** How long a fresh answer is trusted before the next open of the page re-reads. */
export const WAITING_STALE_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

interface SourceWords {
  /** Group heading, e.g. "Hires to sign off". */
  label: string;
  /** The action, e.g. "Sign off" — what pressing Open lets you do. */
  verb: string;
  /** The plain noun used when listing the queues that were checked. */
  queue: string;
}

const SOURCE_WORDS: Record<WaitingSource, SourceWords> = {
  recruitment: { label: 'Hires to sign off', verb: 'Sign off', queue: 'hires' },
  refund: { label: 'Refunds to approve', verb: 'Approve', queue: 'refunds' },
  leave: { label: 'Leave to approve', verb: 'Approve', queue: 'leave' },
  meeting_trigger: { label: 'Triggers to decide', verb: 'Decide', queue: 'triggers' },
  grievance: { label: 'Grievances to assign', verb: 'Assign', queue: 'grievances' },
  // A hire whose salary is agreed and whom nobody has started onboarding.
  //
  // NOT "Offers to issue", which is how the Director named it and how the
  // source string still reads. Status 'offer_issued' has never been used once
  // in production (the table has only ever held pending_approval, approved,
  // package_fixed and joined) and no control anywhere in app/ performs that
  // transition, so a heading naming it would send its reader hunting a button
  // that does not exist. The act the product DOES support at this status is
  // onboarding: the job workspace gates "Start Onboarding" on exactly it.
  // His decision — these belong on HR's desk, not his — is unchanged; only
  // the words moved to the act that can actually be done.
  //
  // The verb is read out only in the row's aria-label (the visible control is
  // always "Open"). `queue` must stay distinct from recruitment's 'hires', or
  // the all-clear sentence would name the same queue twice.
  offer: { label: 'Hires to bring on board', verb: 'Start onboarding', queue: 'onboarding' },
};

const OTHER_WORDS: SourceWords = { label: 'Other', verb: 'Open', queue: 'other' };

/**
 * Plain words for a queue. A source this file has never heard of (the RPC
 * grew a sixth queue before this page did) still gets a readable heading
 * rather than crashing or being dropped. A source that is missing, empty or
 * not even a string reads as "Other" — a malformed row must not take the
 * page down.
 */
export function sourceWords(source: string | null | undefined): SourceWords {
  const key = typeof source === 'string' ? source : '';
  const known = (SOURCE_WORDS as Record<string, SourceWords | undefined>)[key];
  if (known) return known;
  const plain = key.replace(/_/g, ' ').trim();
  if (!plain || plain === 'other') return OTHER_WORDS;
  return { label: `${plain[0].toUpperCase()}${plain.slice(1)} to act on`, verb: 'Open', queue: plain };
}

/** The group key for a row: its source, or "other" when it has none. */
function sourceKey(row: Partial<WaitingRow> | null | undefined): string {
  const s = row && typeof row === 'object' ? row.source : undefined;
  return typeof s === 'string' && s.trim() ? s : 'other';
}

/** "today", "1 day", "48 days". Unusable input reads as unknown, not as zero. */
export function ageWords(ageDays: number | null | undefined): string {
  if (ageDays === null || ageDays === undefined || Number.isNaN(ageDays) || ageDays < 0) {
    return 'age unknown';
  }
  const n = Math.floor(ageDays);
  if (n === 0) return 'today';
  return `${n} day${n === 1 ? '' : 's'}`;
}

export type AgeTone = 'old' | 'aging' | 'fresh';

/** Thirty days is old, seven is aging, anything younger is just waiting. */
export function ageTone(ageDays: number | null | undefined): AgeTone {
  if (ageDays === null || ageDays === undefined || Number.isNaN(ageDays)) return 'fresh';
  if (ageDays >= 30) return 'old';
  if (ageDays >= 7) return 'aging';
  return 'fresh';
}

/**
 * The chip colours, matching DueChip on page.tsx tone for tone (past = red,
 * soon = amber, calm = neutral) so the two kinds of chip read as one system.
 * DueChip is not exported from the page, hence the same classes rather than
 * the same component.
 */
export function ageChipClasses(tone: AgeTone): string {
  if (tone === 'old') return 'border-red-300 text-red-700 dark:border-red-900 dark:text-red-300';
  if (tone === 'aging') {
    return 'border-amber-300 text-amber-800 dark:border-amber-900 dark:text-amber-300';
  }
  return 'border-muted-foreground/30 text-muted-foreground';
}

/**
 * Rupees with Indian grouping: 54500 → "₹54,500", 5450000 → "₹54,50,000".
 * Done by hand rather than through a locale so every browser prints the same
 * string. Paise are shown only when present.
 */
export function formatRupees(amount: number): string {
  if (!Number.isFinite(amount)) return '₹—';
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const hasPaise = Math.round(abs * 100) % 100 !== 0;
  const [whole, paise] = (hasPaise ? abs.toFixed(2) : Math.round(abs).toString()).split('.');
  let grouped: string;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${last3}`;
  }
  return `${negative ? '-' : ''}₹${grouped}${paise ? `.${paise}` : ''}`;
}

/** "07:12" on the Indian clock, the calendar the database itself compares against. */
export function checkedAtWords(checkedAt: Date | number | string): string {
  const ms = typeof checkedAt === 'number' ? checkedAt : new Date(checkedAt).getTime();
  // 0 is React Query's "never fetched" stamp, not a time anyone checked at.
  if (Number.isNaN(ms) || ms <= 0) return 'time unknown';
  return new Date(ms + 5.5 * 3_600_000).toISOString().slice(11, 16);
}

// ---------------------------------------------------------------------------
// One clock
// ---------------------------------------------------------------------------
//
// The RPC returns both `waiting_since` and its own `age_days`. The page reads
// ONE of them: every age it prints — chip, sort, "oldest" in the summary — is
// derived from `waiting_since` against the moment the answer arrived, so the
// chip, the order and the "checked HH:MM" stamp can never disagree with each
// other. `age_days` is used only when `waiting_since` is missing or unusable.

const DAY_MS = 86_400_000;

/** Milliseconds for any of the clock inputs this file accepts; NaN when unusable. */
function toMs(at: Date | number | string | null | undefined): number {
  if (at === null || at === undefined) return Number.NaN;
  if (typeof at === 'number') return at;
  return new Date(at).getTime();
}

/**
 * Whole days between `waitingSince` and `now`, floored the way the database
 * floors it. Null when either side is unusable. A clock a few seconds behind
 * the server would otherwise floor a just-created item to -1, so the result
 * is clamped at 0.
 */
export function ageDaysFrom(
  waitingSince: string | null | undefined,
  now: Date | number | string,
): number | null {
  const since = toMs(waitingSince);
  const at = toMs(now);
  if (Number.isNaN(since) || Number.isNaN(at) || at <= 0) return null;
  return Math.max(0, Math.floor((at - since) / DAY_MS));
}

/** The age of a row on the one clock; the RPC's age_days only as a fallback. */
export function rowAgeDays(row: WaitingRow, now: Date | number | string): number | null {
  const derived = ageDaysFrom(row.waiting_since, now);
  if (derived !== null) return derived;
  return typeof row.age_days === 'number' && Number.isFinite(row.age_days) && row.age_days >= 0
    ? Math.floor(row.age_days)
    : null;
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export interface WaitingGroup {
  source: string;
  rows: WaitingRow[];
}

function sinceMs(row: WaitingRow): number {
  const ms = Date.parse(row.waiting_since);
  // An unparsable date sorts LAST — it must not jump the queue by accident.
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * Groups by queue. Inside a group the oldest item is first; the groups
 * themselves are ordered by their oldest item, so the queue that has been
 * waiting longest is the one at the top. The RPC already sorts oldest-first,
 * but this does not rely on it — a re-ordered answer must not re-order the page.
 *
 * Anything that is not an array of rows (a malformed payload) groups to
 * nothing rather than throwing inside render; rows that are not objects are
 * skipped, and a row with no source goes under "other".
 */
export function groupBySource(rows: unknown): WaitingGroup[] {
  if (!Array.isArray(rows)) return [];
  const bySource = new Map<string, WaitingRow[]>();
  for (const row of rows as unknown[]) {
    if (!row || typeof row !== 'object') continue;
    const key = sourceKey(row as WaitingRow);
    const list = bySource.get(key);
    if (list) list.push(row as WaitingRow);
    else bySource.set(key, [row as WaitingRow]);
  }
  const groups: WaitingGroup[] = [];
  for (const [source, list] of bySource) {
    groups.push({ source, rows: [...list].sort((a, b) => sinceMs(a) - sinceMs(b)) });
  }
  return groups.sort((a, b) => sinceMs(a.rows[0]) - sinceMs(b.rows[0]));
}

/** The largest age in the list on the one clock, or null for an empty one. */
export function oldestAgeDays(rows: readonly WaitingRow[], now: Date | number | string): number | null {
  let oldest: number | null = null;
  for (const row of rows) {
    const age = rowAgeDays(row, now);
    if (age === null) continue;
    if (oldest === null || age > oldest) oldest = age;
  }
  return oldest;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * The href a row may be linked to: an in-app path only. Anything that is not
 * a string starting with a single "/" — an absolute URL, a protocol-relative
 * "//host", javascript:, an empty value — gets no link at all; the row is
 * still shown, with a note that it has no page.
 */
export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  return href;
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

/** What the header count reads: the number below the cap, a floor at it. */
export function countWords(rows: readonly WaitingRow[]): string {
  return isCapped(rows) ? `${WAITING_ROW_CAP}+` : String(rows.length);
}

/**
 * "59 items waiting · oldest 48 days · checked 07:12" — or, at the RPC's
 * LIMIT, "Showing the first 500 — open the modules for the rest · oldest 48
 * days · checked 07:12". At the cap no total is printed: the RPC does not say
 * how much more there is, so neither does this.
 */
export function summaryLine(rows: readonly WaitingRow[], checkedAt: Date | number | string): string {
  const n = rows.length;
  const count = isCapped(rows)
    ? `Showing the first ${WAITING_ROW_CAP} — open the modules for the rest`
    : `${n} item${n === 1 ? '' : 's'} waiting`;
  const oldest = oldestAgeDays(rows, checkedAt);
  const age = oldest === null ? null : `oldest ${ageWords(oldest)}`;
  return [count, age, `checked ${checkedAtWords(checkedAt)}`].filter(Boolean).join(' · ');
}

/** The queues that were checked, in the words a reader would use. */
export function queuesChecked(): string {
  const names = WAITING_SOURCES.map((s) => SOURCE_WORDS[s].queue).join(', ');
  return `${WAITING_SOURCES.length} queues (${names})`;
}

export type WaitingState =
  | { kind: 'empty'; checkedAt: Date | number | string }
  | { kind: 'error'; reason: string };

/**
 * The sentence for a section with no rows to show. There are two such
 * sections and they must never read alike: one is an all-clear that names what
 * it checked and when; the other is a check that did not happen.
 */
export function emptyVerdict(state: WaitingState): string {
  if (state.kind === 'error') {
    return `Could not check what is waiting on you — ${state.reason}`;
  }
  return `Nothing waiting across ${queuesChecked()} — checked ${checkedAtWords(state.checkedAt)}`;
}

/**
 * The reason a failed call is shown with. The one failure this section
 * expects — the function not being installed yet, which PostgREST reports as
 * a schema-cache miss — gets said in plain words. Anything else is quoted as
 * it arrived, because guessing at a cause is exactly what this page refuses
 * to do.
 */
export function describeError(err: unknown): string {
  const message =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
        ? err.message
        : '';
  if (/fn_my_desk_waiting|schema cache|PGRST202/i.test(message)) {
    return 'the check behind this section is not installed yet, so nothing here has been counted';
  }
  return message || 'the request did not come back';
}

/** At the RPC's ceiling the list is a floor, not a total. */
export function isCapped(rows: readonly WaitingRow[]): boolean {
  return rows.length >= WAITING_ROW_CAP;
}

// ---------------------------------------------------------------------------
// Which branch renders
// ---------------------------------------------------------------------------

/** The slice of a React Query result the branch decision reads. */
export interface QueryLike {
  status: 'pending' | 'error' | 'success' | string;
  fetchStatus: 'fetching' | 'paused' | 'idle' | string;
  data: unknown;
  error?: unknown;
}

export type RenderState = 'error' | 'paused' | 'loading' | 'empty' | 'rows';

/**
 * THE rule that chooses what the section shows, as a pure function so the
 * test file can state it directly.
 *
 *   error   — the call failed, or the answer arrived in a shape that is not a
 *             list. Never the all-clear.
 *   paused  — no answer yet AND React Query has paused the fetch (offline
 *             phone). This is the case `isLoading` misses: with react-query 5,
 *             isLoading = isPending && fetchStatus === 'fetching', so a paused
 *             fetch has isLoading=false and data=undefined — keyed on isLoading
 *             it fell through to "nothing waiting".
 *   loading — no answer yet, fetch in flight (or not started).
 *   empty   — the call SUCCEEDED and the list has no rows. The only branch
 *             allowed to say "nothing waiting".
 *   rows    — the call succeeded and there are rows.
 */
export function renderState(q: QueryLike): RenderState {
  if (q.error || q.status === 'error') return 'error';
  if (q.data !== undefined && !Array.isArray(q.data)) return 'error';
  if (q.data === undefined) return q.fetchStatus === 'paused' ? 'paused' : 'loading';
  if (q.status !== 'success') return 'loading';
  return (q.data as unknown[]).length === 0 ? 'empty' : 'rows';
}
