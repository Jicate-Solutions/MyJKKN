// lib/services/meetings/my-bookings-query.ts
//
// Query shaping for "My Meetings" (/meetings/my-bookings) — the list of every
// native booking the signed-in person is IN, whether they are hosting it or
// attending it.
//
// WHY THIS IS NOT /meetings/inbox
//   The inbox reads meeting_bookings through the SESSION client, so it is
//   bounded by the only SELECT policy that table has:
//
//     mb_host_select : is_super_admin() OR is_admin()
//                      OR host_profile_id = auth.uid()
//                                  (20260611190000_native_scheduling_engine.sql)
//
//   That policy never mentions attendee_profile_id. So a meeting somebody
//   booked WITH you is invisible everywhere in the meetings module — even
//   though HostSchedulingService writes attendee_profile_id on every
//   host-scheduled meeting with an internal person
//   (host-scheduling-service.ts, `attendee_profile_id: primary.profileId`).
//   The inbox answers "what did people book with me". This page answers
//   "what am I in", which is a different question with a different row set.
//
// WHY A SERVICE-ROLE READ
//   Widening the RLS policy is a database change, and database changes here
//   are Director-gated. Reading through the service-role client with an
//   explicit participant predicate is the pattern this module already uses for
//   everything RLS does not cover (see [uid]/actions.ts, which resolves the
//   user from the session and then acts through service-role). The predicate
//   is built HERE, from a server-resolved profile id, and buildParticipantOr
//   refuses anything that is not a uuid — the id is interpolated into a
//   PostgREST filter expression, so its shape is a correctness question.

/** The status values meeting_bookings_status_check actually permits. */
export const BOOKING_STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type MyBookingFilterKey = 'upcoming' | 'past' | 'cancelled' | 'all';

export interface MyBookingFilter {
  key: MyBookingFilterKey;
  label: string;
  /** null = do not constrain status. */
  statuses: readonly BookingStatus[] | null;
  /** null = do not constrain time. */
  when: 'future' | 'past' | null;
  /** Upcoming reads soonest-first; history reads newest-first. */
  ascending: boolean;
}

// Upcoming/Past are TIME questions, not status questions — nothing moves a
// booking to 'completed' on its own, so a meeting held last month is still
// 'confirmed'. Filtering on status alone would list every past meeting under
// Upcoming and leave Past permanently empty (the bug the inbox already fixed).
// 'no_show' is history by definition and only ever appears under Past/All.
export const MY_BOOKING_FILTERS: readonly MyBookingFilter[] = [
  { key: 'upcoming', label: 'Upcoming', statuses: ['confirmed'], when: 'future', ascending: true },
  {
    key: 'past',
    label: 'Past',
    statuses: ['confirmed', 'completed', 'no_show'],
    when: 'past',
    ascending: false,
  },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'], when: null, ascending: false },
  { key: 'all', label: 'All', statuses: null, when: null, ascending: false },
] as const;

export const DEFAULT_FILTER_KEY: MyBookingFilterKey = 'upcoming';

/** Unknown / absent ?status= falls back to Upcoming rather than showing nothing. */
export function resolveFilter(param?: string | null): MyBookingFilter {
  const match = MY_BOOKING_FILTERS.find((f) => f.key === param);
  if (match) return match;
  return MY_BOOKING_FILTERS.find((f) => f.key === DEFAULT_FILTER_KEY) as MyBookingFilter;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The PostgREST `.or()` expression for "I am in this meeting".
 *
 * Throws on a non-uuid rather than returning a filter, because a malformed id
 * here would not narrow the query — it would change what the expression means.
 */
export function buildParticipantOr(profileId: string): string {
  if (!profileId || !UUID_RE.test(profileId)) {
    throw new Error('buildParticipantOr requires a uuid profile id');
  }
  return `host_profile_id.eq.${profileId},attendee_profile_id.eq.${profileId}`;
}

export type ViewerRole = 'host' | 'attendee';

export interface ParticipantRow {
  host_profile_id?: string | null;
  attendee_profile_id?: string | null;
}

/** Which side of the meeting the viewer is on. null = neither (should not list). */
export function viewerRole(row: ParticipantRow, profileId: string): ViewerRole | null {
  if (!row || !profileId) return null;
  if (row.host_profile_id && row.host_profile_id === profileId) return 'host';
  if (row.attendee_profile_id && row.attendee_profile_id === profileId) return 'attendee';
  return null;
}

/**
 * May this viewer open /meetings/[uid]?
 *
 * Host only. That page reads through the session client, so mb_host_select
 * decides: an attendee following the link gets notFound(), not the meeting.
 * Linking attendee rows there would hand the person a dead end, so the list
 * shows them what it can inline instead.
 */
export function canOpenDetail(role: ViewerRole | null): boolean {
  return role === 'host';
}

/** A meeting that has ended and that nobody has said happened yet. */
export function isAwaitingOutcome(
  row: { status?: string | null; start_time?: string | null },
  now: Date = new Date(),
): boolean {
  if (!row || row.status !== 'confirmed' || !row.start_time) return false;
  return new Date(row.start_time).getTime() < now.getTime();
}
