// lib/services/meetings/meeting-followup-routine.ts
//
// The pure half of the meetings follow-up routine
// (app/api/cron/meetings-followup-routine/route.ts). Everything here is a plain
// function of its arguments — no database, no clock of its own — so the rules
// that decide WHO is told WHAT can be tested without a Supabase client.
//
// Two passes, both rules-based, no model:
//   A. "Meeting record ready": a Fireflies note has been matched to a meeting
//      and its follow-ups have been turned into tasks. The host gets one bell
//      card per note, saying how many follow-ups are still open on that
//      meeting.
//   B. Weekly digest: a host with follow-ups still open after the stale window
//      gets one card a week naming how many, across how many meetings, and the
//      three oldest meetings.
//
// THE TUNABLES ARE CONFIG ROWS (docs/architecture/config-table-pattern.md).
// Each knob below is a global platform_policies row seeded by migration
// 20270421104700 (the four keys are in POLICY_KEYS). No page edits these rows
// yet: a value changes only by a database update of its row. The route
// reads them on every run; DEFAULT_POLICIES are only the values it falls back to
// when a row is missing, switched off, or holds something unusable — and a row
// that holds something unusable is named in the run's report, never dropped
// silently.

export const POLICY_PREFIX = 'meetings.followup_routine.';

export const POLICY_KEYS = {
  /** A follow-up open longer than this many days counts as stale for the weekly digest. */
  staleDays: 'meetings.followup_routine.stale_days',
  /**
   * A "record ready" card is only sent for a note whose follow-ups were applied
   * within this many days. Without this cap, switching the routine on weeks
   * after the schedule row was created would send one card for every note
   * applied in between, all at once.
   */
  recordReadyLookbackDays: 'meetings.followup_routine.record_ready_lookback_days',
  /** How long a "record ready" card stays in the bell before it expires. */
  recordReadyExpiryDays: 'meetings.followup_routine.record_ready_expiry_days',
  /** How long a weekly digest card stays in the bell before it expires. */
  digestExpiryDays: 'meetings.followup_routine.digest_expiry_days',
} as const;

export interface FollowupPolicies {
  staleDays: number;
  recordReadyLookbackDays: number;
  recordReadyExpiryDays: number;
  digestExpiryDays: number;
}

/** Fallbacks only — the live values are the platform_policies rows. */
export const DEFAULT_POLICIES: Readonly<FollowupPolicies> = Object.freeze({
  staleDays: 7,
  recordReadyLookbackDays: 7,
  recordReadyExpiryDays: 7,
  digestExpiryDays: 8,
});

/** A day count above this is treated as a typo, not a setting. */
export const MAX_POLICY_DAYS = 365;

export interface PolicyRow {
  policy_key: string;
  value: unknown;
  is_active: boolean | null;
}

function asDays(v: unknown): number | null {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && v.trim() !== ''
        ? Number(v)
        : Number.NaN;
  return Number.isFinite(n) && n > 0 && n <= MAX_POLICY_DAYS ? n : null;
}

/**
 * Turn the routine's platform_policies rows into the values a run uses.
 * A missing or switched-off row keeps its default. An ACTIVE row whose value is
 * not a day count between 0 (exclusive) and MAX_POLICY_DAYS also keeps its
 * default, and its key is returned in `ignored` so the run reports it.
 */
export function readPolicies(rows: PolicyRow[]): {
  policies: FollowupPolicies;
  ignored: string[];
} {
  const policies: FollowupPolicies = { ...DEFAULT_POLICIES };
  const ignored: string[] = [];
  const fieldByKey = new Map<string, keyof FollowupPolicies>(
    (Object.entries(POLICY_KEYS) as Array<[keyof FollowupPolicies, string]>).map(([f, k]) => [k, f]),
  );
  for (const row of rows) {
    if (row.is_active === false) continue;
    const field = fieldByKey.get(row.policy_key);
    if (!field) continue;
    const days = asDays(row.value);
    if (days === null) ignored.push(row.policy_key);
    else policies[field] = days;
  }
  return { policies, ignored };
}

export const RECORD_READY_CATEGORY = 'meetings:record-ready';
export const DIGEST_CATEGORY = 'meetings:followups-weekly';

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

export interface AppliedNote {
  id: string;
  booking_id: string | null;
  title: string | null;
  action_items_applied_at: string | null;
}

/**
 * The oldest moment a note may have been applied and still be carded. The
 * later of the routine's own creation time (so the historical notes that
 * existed before the routine are never carded) and the lookback window.
 */
export function effectiveFloor(floorIso: string, now: Date, lookbackDays: number): string {
  const floorMs = Date.parse(floorIso);
  const lookbackMs = now.getTime() - lookbackDays * DAY_MS;
  return new Date(Math.max(floorMs, lookbackMs)).toISOString();
}

/** Notes eligible for a "record ready" card: matched, applied, on/after the floor. */
export function selectRecordReadyNotes(notes: AppliedNote[], floorIso: string): AppliedNote[] {
  const floorMs = Date.parse(floorIso);
  return notes.filter(
    (n) =>
      n.booking_id !== null &&
      n.action_items_applied_at !== null &&
      Date.parse(n.action_items_applied_at) >= floorMs,
  );
}

export function recordReadyTitle(noteTitle: string | null): string {
  const t = (noteTitle ?? '').trim();
  return `Meeting record ready — ${t || 'your meeting'}`;
}

/**
 * "<N> open follow-ups to review on this meeting". The count is every open
 * follow-up on the MEETING (booking), not only the ones this note produced —
 * hand-entered items and items from an earlier note on the same meeting are
 * included — so the wording says "on this meeting". The meeting page offers
 * "Mark as done" / "Mark as open" per item, so the card asks the host to
 * review them, not to "confirm" them. While the meeting still reads
 * 'confirmed' — nobody has yet said whether it took place — the card also asks
 * the host to mark whether it happened.
 */
export function recordReadyBody(openCount: number, bookingStatus: string | null): string {
  const awaitingOutcome = bookingStatus === 'confirmed';
  if (openCount === 0) {
    return awaitingOutcome
      ? 'No open follow-ups on this meeting. Mark whether it happened'
      : 'No open follow-ups on this meeting';
  }
  const head = `${openCount} open follow-up${openCount === 1 ? '' : 's'} to review on this meeting`;
  return awaitingOutcome ? `${head}, and mark whether it happened` : head;
}

export function recordReadyKey(noteId: string): string {
  return `meetings:record-ready:${noteId}`;
}

/** ISO-8601 week of a moment, read on the IST calendar: e.g. '2026-W39'. */
export function isoWeekKey(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function digestKey(hostId: string, at: Date): string {
  return `meetings:followups:${hostId}:${isoWeekKey(at)}`;
}

export interface OpenItem {
  host_profile_id: string;
  booking_id: string;
  created_at: string;
}

export interface MeetingLabel {
  uid: string;
  title: string;
  start_time: string;
}

export interface HostDigest {
  hostId: string;
  itemCount: number;
  meetingCount: number;
  oldestDays: number;
  /** booking ids of the (up to) three oldest meetings, oldest first. */
  oldestBookingIds: string[];
}

/**
 * Group open follow-ups older than `staleDays` by host. A host with none gets no
 * digest. "Oldest meetings" are ordered by each meeting's oldest open item.
 */
export function buildHostDigests(items: OpenItem[], now: Date, staleDays: number): HostDigest[] {
  const cutoff = now.getTime() - staleDays * DAY_MS;
  const byHost = new Map<string, Map<string, number>>();
  const countByHost = new Map<string, number>();

  for (const it of items) {
    const created = Date.parse(it.created_at);
    if (!(created < cutoff)) continue;
    const meetings = byHost.get(it.host_profile_id) ?? new Map<string, number>();
    const prev = meetings.get(it.booking_id);
    meetings.set(it.booking_id, prev === undefined ? created : Math.min(prev, created));
    byHost.set(it.host_profile_id, meetings);
    countByHost.set(it.host_profile_id, (countByHost.get(it.host_profile_id) ?? 0) + 1);
  }

  const out: HostDigest[] = [];
  for (const [hostId, meetings] of byHost) {
    const ordered = [...meetings.entries()].sort((a, b) => a[1] - b[1]);
    out.push({
      hostId,
      itemCount: countByHost.get(hostId) ?? 0,
      meetingCount: meetings.size,
      oldestDays: Math.floor((now.getTime() - ordered[0][1]) / DAY_MS),
      oldestBookingIds: ordered.slice(0, 3).map(([id]) => id),
    });
  }
  return out;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * "<n> follow-ups open for more than <d> days across <m> meetings, oldest <x>
 * days". The digest counts ONLY items older than the stale window, so the title
 * names that window (`staleDays`, the value this run used) — "<n> open
 * follow-ups" alone would read as every open item.
 */
export function digestTitle(d: HostDigest, staleDays: number): string {
  return (
    `${plural(d.itemCount, 'follow-up')} open for more than ${plural(staleDays, 'day')} ` +
    `across ${plural(d.meetingCount, 'meeting')}, oldest ${plural(d.oldestDays, 'day')}`
  );
}

const DIGEST_ACTION = 'Open each meeting to review them and mark the finished ones done.';

export function digestBody(oldestTitles: string[]): string {
  if (oldestTitles.length === 0) return DIGEST_ACTION;
  return `Oldest: ${oldestTitles.join('; ')}. ${DIGEST_ACTION}`;
}
