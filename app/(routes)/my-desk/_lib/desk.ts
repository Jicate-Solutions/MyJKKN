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

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Whole days from `todayIso` to `dueDate`, both `YYYY-MM-DD`. Negative means
 * the date has passed. Parsed as UTC midnight on both sides so a viewer's local
 * timezone can never shift the answer by a day — the database compares the same
 * way, against the IST calendar date.
 */
export function daysUntil(dueDate: string, todayIso: string): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(today)) return 0;
  return Math.round((due - today) / 86_400_000);
}

/** Plain words for a due date, plus how alarmed to look about it. */
export function describeDue(
  dueDate: string,
  todayIso: string,
): { days: number; label: string; tone: 'past' | 'soon' | 'calm' } {
  const days = daysUntil(dueDate, todayIso);
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
 * Is the door actually open right now?
 *
 * Mirrors fn_handover_grants_key exactly: status still open, never revoked, and
 * the due date not yet past. It has to mirror it, because a row can sit at
 * status `accepted` with a due date three days gone — the nightly sweep has not
 * relabelled it yet, but the database already refuses the page. Showing a live
 * "Open the page" button there sends somebody into an access-denied panel with
 * no explanation.
 */
export function accessIsLive(row: HandoverRow, todayIso: string): boolean {
  if (!OPEN_STATUSES.includes(row.status)) return false;
  if (row.revoked_at) return false;
  return daysUntil(row.due_date, todayIso) >= 0;
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
    const age = endDay ? -daysUntil(endDay, todayIso) : Number.POSITIVE_INFINITY;
    if (age <= recentWindowDays) recentlyClosed.push(row);
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

export type DeskVerdictKind = 'ok' | 'empty' | 'partial' | 'unknown' | 'unavailable';

export interface DeskVerdict {
  kind: DeskVerdictKind;
  /** How many rows exist for the caller according to the probe, when known. */
  expected: number | null;
  /** How many the session read actually returned. */
  visible: number;
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
 *   unknown     — one read worked and cannot settle the question on its own.
 *   partial     — the probe counted more than the list shows. Rows are hidden.
 *   empty       — the probe positively confirms there is nothing. Safe to say so.
 *   ok          — the list is complete.
 */
export function readabilityVerdict(input: {
  rowsFailed: boolean;
  probeFailed: boolean;
  probe: DeskProbe | null | undefined;
  visibleCount: number;
}): DeskVerdict {
  const { rowsFailed, probeFailed, probe, visibleCount } = input;

  const expectedRaw = probeFailed ? null : probe?.total_count;
  const expected =
    typeof expectedRaw === 'number' && Number.isFinite(expectedRaw) ? expectedRaw : null;

  if (rowsFailed && probeFailed) return { kind: 'unavailable', expected: null, visible: 0 };

  // The list failed. Even a good probe cannot put rows on the screen.
  if (rowsFailed) return { kind: 'unknown', expected, visible: 0 };

  // The probe failed. With rows on screen that costs only the completeness
  // assurance; with none it costs the right to call the desk empty.
  if (probeFailed || expected === null) {
    return { kind: visibleCount > 0 ? 'ok' : 'unknown', expected, visible: visibleCount };
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
