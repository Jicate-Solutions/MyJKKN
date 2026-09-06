// lib/services/meetings/meeting-mode-switch.ts
//
// Pure rules for turning a face-to-face booking into a Google Meet.
// Dependency-free on purpose (same reasoning as native-slot-engine.ts and
// google-busy-calendars.ts): the decisions below are the ones most worth
// unit-testing, and they must be testable without dragging in Supabase,
// Google or the mailer.
//
// Director's decisions encoded here:
//   8. The cut-off is the meeting type's EXISTING min_notice_min. No new config.
//   B. A pending visitor request auto-expires when that same notice window
//      closes, and is dead once start_time has passed. No cron: an expired
//      request is simply READ as declined.
//   C. The notice check runs TWICE — when the request is made and again when
//      it is approved. A request made Monday and approved Thursday must not
//      move a Tuesday meeting.
//
// Director's decisions of 2026-08-21, added here:
//   1. A PHONE booking switches to a video call exactly as a face-to-face one
//      does. Phone was excluded on 2026-08-19 as "never decided"; it is now
//      decided, and it is the bigger population (95 live phone types with 95
//      hosts, against 141 in-person types with 110 hosts).
//   2. Switching BACK is HOST ONLY. A visitor may ask to go online; only the
//      person who owns the room and the calendar may undo it.

/** Where a meeting happens. Mirrors meeting_types.location_mode. */
export type LocationMode = 'in_person' | 'phone' | 'online';

/** Lifecycle of a visitor's "can we make this online?" request. */
export type SwitchRequestStatus = 'pending' | 'approved' | 'declined';

/** Who asked. A host never requests — they switch directly. */
export type SwitchRequestedBy = 'attendee' | 'host';

/** The switch-related columns of a meeting_bookings row. */
export interface ModeSwitchFields {
  location_mode_override?: string | null;
  mode_switch_requested_by?: string | null;
  mode_switch_requested_at?: string | null;
  mode_switch_requested_start?: string | null;
  mode_switch_request_status?: string | null;
}

/**
 * The mode a booking is ACTUALLY in.
 *
 * The booking-level override wins over the meeting type. Anything the override
 * column does not admit falls back to the type, so a value written by a future
 * migration can never make a live booking read as an unknown mode.
 */
export function effectiveLocationMode(
  typeMode: LocationMode | string | null | undefined,
  override: string | null | undefined,
): LocationMode {
  if (override === 'online') return 'online';
  if (typeMode === 'online' || typeMode === 'phone' || typeMode === 'in_person') return typeMode;
  return 'in_person';
}

/**
 * Is there still time to switch this meeting?
 *
 * True while the meeting is at least `minNoticeMin` minutes away. This is the
 * one cut-off (decision 8) and it is evaluated against the meeting's CURRENT
 * start — the point is "do not rearrange a meeting people are about to walk
 * into", which is about when it starts, not when the new slot would be.
 *
 * A negative or missing notice setting is treated as zero, matching the slot
 * engine: the only remaining bar is that the meeting has not already started.
 */
export function isSwitchAllowedNow(
  startTime: string | Date,
  minNoticeMin: number | null | undefined,
  now: Date = new Date(),
): boolean {
  const start = startTime instanceof Date ? startTime : new Date(startTime);
  if (Number.isNaN(start.getTime())) return false;
  const notice = Math.max(0, minNoticeMin ?? 0);
  return start.getTime() - now.getTime() >= notice * 60_000;
}

/**
 * What a stored switch request MEANS right now.
 *
 * 'none'     — nothing was ever asked, or it was already resolved.
 * 'pending'  — asked, still inside the notice window, awaiting the host.
 * 'expired'  — asked, but the notice window has since closed (or the meeting
 *              started). Decision B: treat it exactly as declined. Nothing is
 *              rewritten here; expiry is a reading of the row, not a job.
 */
export function switchRequestState(
  booking: ModeSwitchFields & { start_time?: string | null },
  minNoticeMin: number | null | undefined,
  now: Date = new Date(),
): 'none' | 'pending' | 'expired' {
  if (booking.mode_switch_request_status !== 'pending') return 'none';
  if (!booking.start_time) return 'expired';
  return isSwitchAllowedNow(booking.start_time, minNoticeMin, now) ? 'pending' : 'expired';
}

/**
 * Can this booking's CURRENT mode be switched to online, and if not, why?
 *
 * Answering this needs a stricter reading than effectiveLocationMode gives:
 * that function deliberately coerces anything it does not recognise to
 * 'in_person' so a live booking never renders as an unknown mode. That is the
 * right default for DISPLAY and the wrong one for a GATE — it would wave
 * through a mode nobody has decided about.
 *
 * The type's raw mode must therefore be one this feature has actually been
 * decided for. Since the Director's ruling of 2026-08-21 that is BOTH
 * 'in_person' and 'phone' — a phone call becomes a video call the same way a
 * face-to-face meeting does, and phone is the larger population (95 live phone
 * types against 141 in-person). Anything else still lands on 'unsupported'
 * rather than being switched.
 *
 *   'online'      — already online, via the type or the booking override.
 *   'switchable'  — in person or on the phone; a Meet link can be added.
 *   'unsupported' — a mode this feature has never been scoped for.
 */
export function switchSourceMode(
  typeMode: LocationMode | string | null | undefined,
  override: string | null | undefined,
): 'online' | 'switchable' | 'unsupported' {
  if (effectiveLocationMode(typeMode, override) === 'online') return 'online';
  return typeMode === 'in_person' || typeMode === 'phone' ? 'switchable' : 'unsupported';
}

/**
 * Can this booking be turned BACK into a face-to-face or phone meeting?
 *
 * Turning it back means CLEARING location_mode_override, because the column's
 * CHECK constraint admits only 'online' or NULL
 * (20260909100000_meeting_booking_mode_switch.sql:49). That single fact decides
 * every answer here:
 *
 *   'switchable'     — the override is what made this booking online, so
 *                      clearing it returns the booking to its type's own mode.
 *   'online_by_type' — the MEETING TYPE is online, for everyone who books it.
 *                      Clearing the override would change nothing, and the
 *                      column cannot say "in person" for one booking. Refused
 *                      with its own answer rather than a misleading failure:
 *                      the fix is to change the type, not this booking.
 *   'not_online'     — it is not a video call, so there is nothing to undo.
 */
export function switchBackState(
  typeMode: LocationMode | string | null | undefined,
  override: string | null | undefined,
): 'switchable' | 'online_by_type' | 'not_online' {
  if (typeMode === 'online') return 'online_by_type';
  if (override === 'online') return 'switchable';
  return 'not_online';
}

/** The columns that clear a request, whatever its outcome. */
export function resolvedRequestPatch(status: Exclude<SwitchRequestStatus, 'pending'>): {
  mode_switch_request_status: SwitchRequestStatus;
  mode_switch_requested_start: null;
} {
  // The requested start is cleared with the request: keeping it would let a
  // stale time be re-applied by a later approval of an already-closed request.
  return { mode_switch_request_status: status, mode_switch_requested_start: null };
}

/**
 * Which of a host's schedules holds their ONLINE hours.
 *
 * `meeting_host_schedules` has no mode column — its columns are exactly
 * id, host_profile_id, institution_id, name, timezone, is_default, created_at,
 * updated_at. A schedule therefore has no idea it is "the online one", and its
 * NAME is a human convention rather than data: "Online Meeting Schedule" is a
 * title somebody typed, and matching on it would break the first time anyone
 * renamed it, in a language the code cannot see.
 *
 * So the online schedule is derived STRUCTURALLY — it is the schedule the
 * host's own online meeting types already point at via meeting_types.schedule_id.
 *
 * Two real cases this must survive, both measured in production 2026-08-31:
 *
 *   NONE — of the 110 hosts who own an in-person type, most own no online type
 *     at all. There is nothing to derive, so this returns null and the caller
 *     keeps exactly today's behaviour. Never an error: those hosts switch
 *     meetings to online today and must go on doing so.
 *
 *   MORE THAN ONE — the 14 live online types sit on 2 distinct schedules
 *     (13 types on one, 1 on the other), both owned by the same host. Picking
 *     whichever row the database happened to return first would make the same
 *     switch resolve different hours on different days.
 *
 * The rule for more than one, therefore: the schedule used by the MOST online
 * types — the host's de-facto online hours — and, if two are level, the lowest
 * schedule id. Ids are immutable, so that tie-break gives the same answer every
 * time; row order and created_at do not (Postgres promises no order without an
 * ORDER BY, and two schedules seeded by one script share a timestamp).
 *
 * A type pinned to NO schedule is skipped rather than counted: it runs on the
 * host's default schedule, which says nothing about which schedule is the
 * online one. Zero of the 14 live online types are in that state.
 */
export function pickOnlineScheduleId(
  onlineTypes: Array<{ schedule_id?: string | null }> | null | undefined,
): string | null {
  const counts = new Map<string, number>();
  for (const t of onlineTypes ?? []) {
    const id = t?.schedule_id;
    if (typeof id !== 'string' || id === '') continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [id, n] of counts) {
    // Strictly more types wins; level on count, the lower id wins. Both
    // comparisons are independent of the order this map was filled in.
    if (n > bestCount || (n === bestCount && best !== null && id < best)) {
      best = id;
      bestCount = n;
    }
  }
  return best;
}
