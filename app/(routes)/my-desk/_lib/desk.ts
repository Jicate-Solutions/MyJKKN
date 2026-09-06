// app/(routes)/my-desk/_lib/desk.ts
// ============================================================================
// Pure logic for /my-desk — the receiving side of a Director handover.
//
// Free of every Supabase and React import on purpose: the page is a client
// component, and importing it would pull the browser Supabase client in at
// module scope, which cannot load under vitest. Everything decidable without
// the network lives here so it can be tested as plain functions.
//
// The one rule this file exists to enforce: a read that did not happen must
// never render as an answer. `readabilityVerdict` is the whole reason — see the
// comment above it.
// ============================================================================

/** Lifecycle of a handover. Only `pending` and `accepted` still grant access. */
export type HandoverStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'done'
  | 'revoked'
  | 'expired'
  | 'orphaned';

/** What the receiver may do on the page they were handed (decision 1). */
export type AccessLevel = 'watch' | 'update' | 'full';

/** A row of director_handovers, already scoped to the signed-in receiver. */
export interface HandoverRow {
  id: string;
  route: string;
  title: string;
  note: string | null;
  permission_keys: string[] | null;
  access_level: AccessLevel | string;
  grantee_user_id: string;
  granted_by: string;
  institution_id: string | null;
  status: HandoverStatus | string;
  due_date: string;
  responded_at: string | null;
  decline_reason: string | null;
  completed_at: string | null;
  revoked_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string | null;
}

/** A row of director_handover_audit. `detail` shape varies by action. */
export interface AuditRow {
  id: string;
  handover_id: string;
  action: string;
  actor_user_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

/** One person named on the caller's own rows (fn_my_desk_people). */
export interface DeskPerson {
  person_id: string;
  person_name: string | null;
  person_email: string | null;
  person_designation: string | null;
}

/** What fn_my_desk_probe returns. */
export interface DeskProbe {
  checked?: boolean;
  open_count?: number;
  closed_count?: number;
  total_count?: number;
}

/** The two statuses under which the receiver can still open the page. */
export const OPEN_STATUSES: readonly string[] = ['pending', 'accepted'];

/** How far back "recently closed" reaches, in days. */
export const RECENTLY_CLOSED_DAYS = 30;

/**
 * Hard ceiling on each list read.
 *
 * PostgREST silently truncates at its own max-rows and says so only in a header
 * (feedback_postgrest_caps_at_10k_silently). An unbounded read that came back
 * short would look exactly like rows being withheld, and this page would then
 * blame a permission rule for its own truncation. Asking for an explicit limit
 * makes the truncation OURS and therefore knowable: `rows.length >= this` is
 * the signal.
 *
 * OPEN AND CLOSED ARE READ SEPARATELY, and this is the reason: one capped read
 * ordered by due date would spend its whole budget on the oldest rows — which
 * on a long-lived desk are all closed — and drop the live work off the bottom,
 * under a banner promising nothing was withheld. A cap that can hide the very
 * thing the page is for is worse than no cap. Open work gets its own budget and
 * cannot be evicted by history.
 */
export const DESK_ROW_LIMIT = 500;

/** Separate budget for ended items — they are a collapsed footnote, not the page. */
export const CLOSED_ROW_LIMIT = 200;

/** Chunk size for the audit read. See `chunk` for why this exists at all. */
export const AUDIT_ID_CHUNK = 100;

/**
 * Split a list into fixed-size chunks.
 *
 * The audit read filters on `handover_id=in.(…)`, which PostgREST takes in the
 * QUERY STRING. Five hundred uuids is roughly 19KB of URL — past what Kong and
 * most CDNs will accept, and the failure is a 414 that would render as "this
 * item has no history": the page stating, from a request that never arrived,
 * that nothing ever happened.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return items.length > 0 ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Whole days from `todayIso` to `dueDate`, both `YYYY-MM-DD`. Negative means
 * the date has passed. Parsed as UTC midnight on both sides so a viewer's local
 * timezone can never shift the answer by a day — the database compares the same
 * way, against the IST calendar date.
 *
 * Returns NaN — not 0 — for anything it cannot parse. Zero would read as "due
 * today" and, through accessIsLive, as an open door: a fabricated answer from a
 * value nobody could read.
 */
export function daysUntil(dueDate: string | null | undefined, todayIso: string): number {
  if (!dueDate) return Number.NaN;
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(today)) return Number.NaN;
  return Math.round((due - today) / 86_400_000);
}

/** Plain words for a due date, plus how alarmed to look about it. */
export function describeDue(
  dueDate: string | null | undefined,
  todayIso: string,
): { days: number; label: string; tone: 'past' | 'soon' | 'calm' } {
  const days = daysUntil(dueDate, todayIso);
  if (Number.isNaN(days)) {
    return { days, label: 'no usable date', tone: 'past' };
  }
  if (days < 0) {
    const n = Math.abs(days);
    return { days, label: `${n} day${n === 1 ? '' : 's'} past the date`, tone: 'past' };
  }
  if (days === 0) return { days, label: 'due today', tone: 'soon' };
  if (days <= 3) return { days, label: `${days} day${days === 1 ? '' : 's'} left`, tone: 'soon' };
  return { days, label: `${days} days left`, tone: 'calm' };
}

/**
 * Days since the last recorded activity. Returns null when nothing has ever
 * been recorded, which is NOT the same as "quiet for zero days".
 */
export function daysQuiet(lastActivityAt: string | null, nowIso: string): number | null {
  if (!lastActivityAt) return null;
  const last = Date.parse(lastActivityAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(last) || Number.isNaN(now)) return null;
  return Math.max(0, Math.floor((now - last) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * Does this handover name any permission at all?
 *
 * `fn_handover_grants_key` unlocks a key only if it is IN `permission_keys`, so
 * a row with none unlocks nothing no matter how open its dates look. The table
 * carries a CHECK that stops the create RPC writing one, but this page must not
 * depend on a constraint it does not own to decide what to promise a person.
 */
export function hasPermissionKeys(row: HandoverRow): boolean {
  return Array.isArray(row.permission_keys) && row.permission_keys.length > 0;
}

/**
 * Is the door actually open right now?
 *
 * Mirrors fn_handover_grants_key: status still open, never revoked, the due
 * date not yet past, and at least one key named. It has to mirror it, because a
 * row can sit at status `accepted` with a due date three days gone — the nightly
 * sweep has not relabelled it yet, but the database already refuses the page.
 * Showing a live "Open the page" button there sends somebody into an
 * access-denied panel with no explanation, which is the failure this whole
 * feature exists to remove.
 */
export function accessIsLive(row: HandoverRow, todayIso: string): boolean {
  if (!OPEN_STATUSES.includes(row.status)) return false;
  if (row.revoked_at) return false;
  if (!hasPermissionKeys(row)) return false;
  const days = daysUntil(row.due_date, todayIso);
  return Number.isFinite(days) && days >= 0;
}

// ---------------------------------------------------------------------------
// Has the page gate caught up with the handover?
//
// THE BUG THESE EXIST TO CLOSE, stated plainly.
//
// A handover unlocks a page in two places. The database learns about it
// immediately — every RLS policy re-asks on the next query. The BROWSER learns
// about it from `usePermissions`, whose React Query entry has a five-minute
// staleTime. /my-desk's own reads have a thirty-second one. So:
//
//   09:57  a HOD opens the app. usePermissions caches a map with no handovers.
//   10:00  the Director hands them a page.
//   10:01  the HOD opens /my-desk. Fresh read: the item is there, live, with an
//          "Open the page" button. They click it. The target page reads the
//          STALE permission map and renders access-denied.
//
// The header on this page promises "Opening the page works for as long as the
// item is open — you do not need any other access." That promise was false for
// up to five minutes, and accepting the item did not fix it, because nothing on
// this page ever touched the ['permissions'] cache entry.
//
// It is worse than a five-minute wait in one case. `applyHandoverGrants` races
// the handover RPC against a 2-second timeout and, on timeout, returns the
// role-only map — which React Query then caches for the FULL five minutes with
// no retry. One slow PostgREST call and the receiver is locked out of their own
// handover for five minutes, with nothing on the page able to clear it.
//
// So the page needs to answer two questions, and both are decidable without the
// network, which is why they live here with tests:
//   1. does the browser's permission map already carry this item's keys?
//   2. if not, may we ask for a fresh one, and how long should we wait first?
// ---------------------------------------------------------------------------

/**
 * Keys that open a page whether or not the map carries them.
 *
 * isPageAccessible() (lib/navigation/permission-filter.ts) short-circuits these
 * two before it looks at anything, so a route declaring one is open to every
 * signed-in user. They must be treated as loaded here for the same reason, and
 * it is not hypothetical: `view_profile` is true on only 18 of 85 live roles,
 * so a handover of /profile — a route that opens for everybody — would
 * otherwise sit behind "Getting your access ready" forever while the page it
 * points at worked perfectly.
 */
const UNIVERSAL_KEYS = new Set(['view_profile', 'view_dashboard']);

/**
 * Does the viewer's merged permission map already carry this handover's access?
 *
 * `some`, not `every`, and deliberately: a row handed at `watch` naming
 * ["x.view", "x.manage"] grants only x.view, so fn_my_handover_permissions
 * returns the one key. Requiring every key would report a correctly-working
 * handover as broken forever.
 *
 * Super admins short-circuit because `usePermissions` returns an EMPTY map for
 * them and carries the capability on a flag instead — testing keys there would
 * report every super admin as permanently un-caught-up.
 *
 * FAILS CLOSED on a missing map, on purpose. The alternative is to assume the
 * gate will open and offer a link that lands on access-denied, which is the
 * defect this function exists to close. A caught-up map is cheap to obtain; a
 * wrongly-promised page is not.
 */
export function handoverKeysAreLoaded(
  row: Pick<HandoverRow, 'permission_keys'>,
  permissions: Record<string, boolean> | null | undefined,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  const keys = row.permission_keys ?? [];
  if (keys.length === 0) return false;
  if (keys.some((key) => UNIVERSAL_KEYS.has(key))) return true;
  if (!permissions) return false;
  return keys.some((key) => permissions[key] === true);
}

/**
 * Is any item on this desk open to the person while their browser does not yet
 * know it? That is exactly the set of "Open the page" buttons that would land on
 * an access-denied panel.
 */
export function deskNeedsPermissionCatchUp(
  rows: HandoverRow[],
  permissions: Record<string, boolean> | null | undefined,
  isSuperAdmin: boolean,
  todayIso: string,
): boolean {
  return rows.some(
    (row) =>
      accessIsLive(row, todayIso) && !handoverKeysAreLoaded(row, permissions, isSuperAdmin),
  );
}

/** How many times the page will ask for a fresh permission map before stopping. */
export const PERMISSION_CATCH_UP_ATTEMPTS = 3;

/**
 * May we ask for a fresh permission map, and how long should we wait first?
 *
 * BOUNDED ON PURPOSE. Invalidating on every render while the keys stay missing
 * would be an infinite refetch loop against the exact endpoint that was already
 * too slow to answer — turning a five-minute inconvenience into a hot loop. So:
 * at most `maxAttempts` asks, backing off, and then the page stops and offers a
 * button instead. A cause it cannot fix (the Director sent a key the access
 * level does not cover) must not become traffic.
 *
 * The first ask has no delay: the overwhelmingly common case is simply a cache
 * older than the handover, and one immediate refetch settles it.
 */
export function permissionCatchUpPlan(input: {
  needsCatchUp: boolean;
  /** True while a permissions fetch is already in flight — asking again is noise. */
  permissionsLoading: boolean;
  attemptsMade: number;
  maxAttempts?: number;
}): { act: boolean; delayMs: number; exhausted: boolean } {
  const { needsCatchUp, permissionsLoading, attemptsMade } = input;
  const maxAttempts = input.maxAttempts ?? PERMISSION_CATCH_UP_ATTEMPTS;

  if (!needsCatchUp) return { act: false, delayMs: 0, exhausted: false };
  if (attemptsMade >= maxAttempts) return { act: false, delayMs: 0, exhausted: true };
  if (permissionsLoading) return { act: false, delayMs: 0, exhausted: false };

  return { act: true, delayMs: attemptsMade === 0 ? 0 : 2000 * attemptsMade, exhausted: false };
}

/** Access level in the words a colleague would use, not the enum. */
export function accessLevelWords(level: string): { title: string; detail: string } {
  switch (level) {
    case 'watch':
      return {
        title: 'Look only',
        detail: 'You can open the page, read it and export it. You cannot change anything.',
      };
    case 'update':
      return {
        title: 'Move it along',
        detail:
          'You can open the page, read it, and update or submit what is already there. You cannot create new records or delete any.',
      };
    case 'full':
      return {
        title: 'Run it',
        detail: 'You can do everything that page offers.',
      };
    default:
      return {
        title: 'Access not recognised',
        detail:
          'This item carries an access level this page does not know. Ask the person who handed it over before relying on it.',
      };
  }
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

/** When an item left the desk. Null while it is still open. */
export function closedAt(row: HandoverRow): string | null {
  if (OPEN_STATUSES.includes(row.status)) return null;
  return row.completed_at ?? row.revoked_at ?? row.responded_at ?? row.updated_at ?? row.created_at;
}

/** Why an item left the desk, in plain words. */
export function closedReason(row: HandoverRow): string {
  switch (row.status) {
    case 'done':
      return 'Marked done';
    case 'declined':
      return 'You declined this';
    case 'revoked':
      return 'Taken back';
    case 'expired':
      return 'The date passed';
    case 'orphaned':
      return 'Returned — your account changed';
    default:
      return 'Closed';
  }
}

export interface DeskBuckets {
  /** Waiting for an accept or a decline. Leads the page (decision 8). */
  awaitingAnswer: HandoverRow[];
  /** Accepted and still open. */
  mine: HandoverRow[];
  /** Ended inside the recent window, newest first. */
  recentlyClosed: HandoverRow[];
  /** Ended before the window. Counted, never listed. */
  olderClosedCount: number;
}

/**
 * Split the desk into what needs an answer, what is being worked on, and what
 * has recently left. Open items sort by due date so the nearest deadline is
 * top; closed items sort by when they ended, newest first.
 */
export function splitDesk(
  rows: HandoverRow[],
  todayIso: string,
  recentWindowDays: number = RECENTLY_CLOSED_DAYS,
): DeskBuckets {
  const awaitingAnswer: HandoverRow[] = [];
  const mine: HandoverRow[] = [];
  const closed: HandoverRow[] = [];

  for (const row of rows) {
    if (row.status === 'pending') awaitingAnswer.push(row);
    else if (row.status === 'accepted') mine.push(row);
    else closed.push(row);
  }

  const byDue = (a: HandoverRow, b: HandoverRow) => a.due_date.localeCompare(b.due_date);
  awaitingAnswer.sort(byDue);
  mine.sort(byDue);

  const withEnd = closed
    .map((row) => ({ row, end: closedAt(row) }))
    .sort((a, b) => (b.end ?? '').localeCompare(a.end ?? ''));

  const recentlyClosed: HandoverRow[] = [];
  let olderClosedCount = 0;
  for (const { row, end } of withEnd) {
    const endDay = end ? end.slice(0, 10) : null;
    // An unreadable end date counts as old rather than recent: better to say
    // "N older items are not listed" than to date-stamp something we cannot read.
    const age = -daysUntil(endDay, todayIso);
    if (Number.isFinite(age) && age <= recentWindowDays) recentlyClosed.push(row);
    else olderClosedCount += 1;
  }

  return { awaitingAnswer, mine, recentlyClosed, olderClosedCount };
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

/** Read a string off an audit `detail` blob without trusting its shape. */
function detailText(detail: Record<string, unknown> | null, key: string): string | null {
  const raw = detail?.[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** One audit line, turned into a sentence. */
export function describeAudit(row: AuditRow): { headline: string; body: string | null } {
  switch (row.action) {
    case 'created':
      return { headline: 'Handed over to you', body: null };
    case 'accepted':
      return { headline: 'You accepted it', body: null };
    case 'declined':
      return { headline: 'You declined it', body: detailText(row.detail, 'reason') };
    case 'progress':
      return { headline: 'Update posted', body: detailText(row.detail, 'note') };
    case 'done':
      return { headline: 'Marked done', body: detailText(row.detail, 'note') };
    case 'revoked':
      return { headline: 'Taken back', body: detailText(row.detail, 'reason') };
    default:
      return { headline: row.action, body: null };
  }
}

/** Newest first. The audit table is append-only, so this never reorders history. */
export function sortAuditNewestFirst(rows: AuditRow[]): AuditRow[] {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Index audit rows by the handover they belong to, each already newest-first. */
export function indexAudit(rows: AuditRow[]): Record<string, AuditRow[]> {
  const out: Record<string, AuditRow[]> = {};
  for (const row of rows) {
    (out[row.handover_id] ??= []).push(row);
  }
  for (const key of Object.keys(out)) out[key] = sortAuditNewestFirst(out[key]);
  return out;
}

/** A person's display name, never a raw uuid. */
export function personName(
  people: Record<string, DeskPerson> | undefined,
  userId: string | null,
): string | null {
  if (!userId) return null;
  const person = people?.[userId];
  if (!person) return null;
  return person.person_name ?? person.person_email ?? null;
}

// ---------------------------------------------------------------------------
// The honest empty state
// ---------------------------------------------------------------------------

export type DeskVerdictKind =
  | 'ok'
  | 'empty'
  | 'capped'
  | 'partial'
  | 'unknown'
  | 'unavailable';

export interface DeskVerdict {
  kind: DeskVerdictKind;
  /** How many rows exist for the caller according to the probe, when known. */
  expected: number | null;
  /** How many the session read actually returned. */
  visible: number;
}

/**
 * Did the probe actually answer?
 *
 * `checked: false` is the probe telling us it could not identify the caller —
 * an answer that is not an answer. Treating it as data would let an expired JWT
 * produce a confirmed-empty desk (the counts are all absent, so `total_count`
 * would read as zero).
 */
export function probeAnswered(probe: DeskProbe | null | undefined): boolean {
  if (!probe) return false;
  if (probe.checked === false) return false;
  return typeof probe.total_count === 'number' && Number.isFinite(probe.total_count);
}

/**
 * Decide what the page is ENTITLED to claim.
 *
 * This exists because RLS denial is silent: a denied read comes back as zero
 * rows with `error === null`, which at this layer is byte-identical to a real
 * empty result (feedback_rls_denial_is_always_silent). Rendering "nothing has
 * been handed to you" off that is a factual claim about a colleague's workload
 * that the page has no evidence for — and on the one page whose entire purpose
 * is to reach people who hold no role, being wrong about it is the failure mode
 * the feature was built to remove.
 *
 * So the page reads twice: once through the session client (RLS applies) and
 * once through fn_my_desk_probe (SECURITY DEFINER, counts only). Disagreement
 * between them is the signal.
 *
 *   unavailable — neither read worked. We know nothing. Say nothing.
 *   unknown     — the probe did not answer, so completeness cannot be vouched
 *                 for. This applies WITH rows on screen too: a list nobody
 *                 checked is not a list we may call complete.
 *   capped      — WE truncated the list. The gap is ours, not a denial, and
 *                 must never be reported as one.
 *   partial     — the two reads disagree and we did not cause it.
 *   empty       — the probe positively confirms there is nothing. Safe to say so.
 *   ok          — the list is complete.
 */
export function readabilityVerdict(input: {
  rowsFailed: boolean;
  probeFailed: boolean;
  probe: DeskProbe | null | undefined;
  visibleCount: number;
  /** True when the list read hit its own row limit — see DESK_ROW_LIMIT. */
  listCapped?: boolean;
}): DeskVerdict {
  const { rowsFailed, probeFailed, probe, visibleCount, listCapped = false } = input;

  const answered = !probeFailed && probeAnswered(probe);
  const expected = answered ? (probe?.total_count as number) : null;

  if (rowsFailed && !answered) return { kind: 'unavailable', expected: null, visible: 0 };

  // The list failed. Even a good probe cannot put rows on the screen.
  if (rowsFailed) return { kind: 'unknown', expected, visible: 0 };

  // The probe did not answer. Rows on screen are still worth showing, but the
  // page has no basis for claiming they are all of them.
  if (!answered || expected === null) {
    return { kind: 'unknown', expected, visible: visibleCount };
  }

  // OUR cap, not their policy. Reporting this as rows being "held back" would
  // blame a permission rule for a limit this page imposed on itself.
  if (listCapped && expected > visibleCount) {
    return { kind: 'capped', expected, visible: visibleCount };
  }

  if (expected > visibleCount) return { kind: 'partial', expected, visible: visibleCount };
  if (expected === 0 && visibleCount === 0) return { kind: 'empty', expected, visible: 0 };
  return { kind: 'ok', expected, visible: visibleCount };
}

/** Today's date in the college's calendar (IST), as `YYYY-MM-DD`. */
export function istToday(now: Date = new Date()): string {
  // The database compares due_date against (now() AT TIME ZONE 'Asia/Kolkata'),
  // so the page must use the same calendar or a viewer abroad sees a different
  // number of days left than the door actually honours.
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
