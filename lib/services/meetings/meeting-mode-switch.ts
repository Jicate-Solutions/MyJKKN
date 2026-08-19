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

/** The columns that clear a request, whatever its outcome. */
export function resolvedRequestPatch(status: Exclude<SwitchRequestStatus, 'pending'>): {
  mode_switch_request_status: SwitchRequestStatus;
  mode_switch_requested_start: null;
} {
  // The requested start is cleared with the request: keeping it would let a
  // stale time be re-applied by a later approval of an already-closed request.
  return { mode_switch_request_status: status, mode_switch_requested_start: null };
}
