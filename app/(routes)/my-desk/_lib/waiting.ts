// app/(routes)/my-desk/_lib/waiting.ts
// ============================================================================
// "Waiting on you" — the words and the ordering, with no React and no Supabase.
//
// The section on /my-desk lists everything the database has COMPUTED to be
// waiting on the signed-in person: hires to sign off, refunds to approve,
// leave to approve, meeting triggers to decide, grievances to assign. The
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
] as const;

export type WaitingSource = (typeof WAITING_SOURCES)[number];

/** One row of fn_my_desk_waiting(), exactly as the contract names it. */
export interface WaitingRow {
  source: WaitingSource | string;
  item_id: string;
  title: string;
  detail: string;
  amount: number | null;
  /** ISO timestamp — when the item started waiting on this person. */
  waiting_since: string;
  age_days: number;
  /** The module page where the action already exists. */
  href: string;
}

/** The RPC caps its answer here; at the cap, some waiting work is off screen. */
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
};

/**
 * Plain words for a queue. A source this file has never heard of (the RPC
 * grew a sixth queue before this page did) still gets a readable heading
 * rather than crashing or being dropped.
 */
export function sourceWords(source: string): SourceWords {
  const known = (SOURCE_WORDS as Record<string, SourceWords | undefined>)[source];
  if (known) return known;
  const plain = source.replace(/_/g, ' ').trim() || 'other';
  return { label: `${plain[0].toUpperCase()}${plain.slice(1)} to act on`, verb: 'Open', queue: plain };
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
 */
export function groupBySource(rows: readonly WaitingRow[]): WaitingGroup[] {
  const bySource = new Map<string, WaitingRow[]>();
  for (const row of rows) {
    const list = bySource.get(row.source);
    if (list) list.push(row);
    else bySource.set(row.source, [row]);
  }
  const groups: WaitingGroup[] = [];
  for (const [source, list] of bySource) {
    groups.push({ source, rows: [...list].sort((a, b) => sinceMs(a) - sinceMs(b)) });
  }
  return groups.sort((a, b) => sinceMs(a.rows[0]) - sinceMs(b.rows[0]));
}

/** The largest age in the list, or null for an empty one. */
export function oldestAgeDays(rows: readonly WaitingRow[]): number | null {
  let oldest: number | null = null;
  for (const row of rows) {
    if (typeof row.age_days !== 'number' || Number.isNaN(row.age_days)) continue;
    if (oldest === null || row.age_days > oldest) oldest = row.age_days;
  }
  return oldest;
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

/** "59 items waiting · oldest 48 days · checked 07:12" */
export function summaryLine(rows: readonly WaitingRow[], checkedAt: Date | number | string): string {
  const n = rows.length;
  const count = `${n} item${n === 1 ? '' : 's'} waiting`;
  const oldest = oldestAgeDays(rows);
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
