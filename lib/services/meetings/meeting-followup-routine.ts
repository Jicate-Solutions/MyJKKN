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
//      card per note, saying how many follow-ups are still open.
//   B. Weekly digest: a host with follow-ups still open after STALE_DAYS gets
//      one card a week naming how many, across how many meetings, and the three
//      oldest meetings.

/** A follow-up open longer than this counts as stale for the weekly digest. */
export const STALE_DAYS = 7;

/**
 * A "record ready" card is only sent for a note whose follow-ups were applied
 * within this many days. The card itself expires after 7 days, so a card about
 * an older note would arrive already past its own usefulness — and without this
 * cap, switching the routine on weeks after the schedule row was created would
 * send one card for every note applied in between, all at once.
 */
export const RECORD_READY_LOOKBACK_DAYS = 7;

export const RECORD_READY_TTL_DAYS = 7;
export const DIGEST_TTL_DAYS = 8;

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
export function effectiveFloor(floorIso: string, now: Date): string {
  const floorMs = Date.parse(floorIso);
  const lookbackMs = now.getTime() - RECORD_READY_LOOKBACK_DAYS * DAY_MS;
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
 * "<N> follow-ups to confirm", plus ", and mark whether it happened" while the
 * meeting still reads 'confirmed' — i.e. nobody has yet said whether it took
 * place.
 */
export function recordReadyBody(openCount: number, bookingStatus: string | null): string {
  const head =
    openCount === 0
      ? 'No open follow-ups to confirm'
      : `${openCount} follow-up${openCount === 1 ? '' : 's'} to confirm`;
  return bookingStatus === 'confirmed' ? `${head}, and mark whether it happened` : head;
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
 * Group open follow-ups older than STALE_DAYS by host. A host with none gets no
 * digest. "Oldest meetings" are ordered by each meeting's oldest open item.
 */
export function buildHostDigests(items: OpenItem[], now: Date): HostDigest[] {
  const cutoff = now.getTime() - STALE_DAYS * DAY_MS;
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

export function digestTitle(d: HostDigest): string {
  return (
    `${d.itemCount} open follow-up${d.itemCount === 1 ? '' : 's'} across ` +
    `${d.meetingCount} meeting${d.meetingCount === 1 ? '' : 's'}, oldest ${d.oldestDays} days`
  );
}

export function digestBody(oldestTitles: string[]): string {
  if (oldestTitles.length === 0) return 'Open the meeting to confirm or close them.';
  return `Oldest: ${oldestTitles.join('; ')}. Open the meeting to confirm or close them.`;
}
