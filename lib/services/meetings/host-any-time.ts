// lib/services/meetings/host-any-time.ts
//
// The host may move their own meeting to a time their published hours do not
// offer (Director, 22 Sep 2026: "the host should be able to schedule anytime —
// it should show time outside the availability hours also, for the host alone").
//
// WHY THIS IS ONE MODULE AND NOT TWO EDITS. The rule has to hold in two places
// that are easy to let drift: the list of times the host is SHOWN, and the
// re-validation that runs when they pick one. rescheduleBooking recomputes the
// offered slots from `sched.windows` and refuses anything not in them, so a
// picker that offered extra times without this would hand the host a grid of
// buttons that all fail with "that time is no longer available" — worse than
// not offering them.
//
// WHAT IT CHANGES, AND WHAT IT DELIBERATELY DOES NOT.
//   · HOURS — replaced by one long window on every weekday. This is the whole
//     of the Director's request.
//   · DAY OVERRIDES — ignored. A day closed in the schedule is still a day he
//     can put a meeting on if he decides to.
//   · MINIMUM NOTICE — dropped to zero. A notice window is the attendee's
//     protection and has never been the host's; the same ruling was applied to
//     switching a meeting to Meet earlier the same week.
//   · BOOKINGS — KEPT. "Anytime" is not "on top of something else", and a
//     double-booked host is a broken promise to two people at once.
//   · BUFFERS — KEPT. He asked for hours outside the published ones, not for
//     the gap that protects the meeting either side. Worth knowing how the
//     engine reads them: buffers pad the CANDIDATE slot, not the existing
//     booking (native-slot-engine, "conflict check with buffers padding the
//     CANDIDATE"), so it is bufferAfterMin that stops a new slot butting up
//     against the next meeting. If he wants buffers gone too, it is one line
//     here.
//
// Nothing in this module widens what a VISITOR sees. It is reached only from
// paths that have already proved the caller is the booking's host.

import type { EngineWindow } from './native-slot-engine';

/** 07:00 in the schedule's own timezone. */
export const HOST_ANY_TIME_START_MIN = 7 * 60;
/** 22:00. Not midnight-to-midnight: 24 hours of ten-minute slots is 144 buttons
 *  a day, which is a wall rather than a choice. This spans a JKKN working day
 *  generously at both ends. */
export const HOST_ANY_TIME_END_MIN = 22 * 60;

/** One long window on all seven days, in place of the published hours. */
export function hostAnyTimeWindows(): EngineWindow[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startMinute: HOST_ANY_TIME_START_MIN,
    endMinute: HOST_ANY_TIME_END_MIN,
  }));
}

/**
 * The slot-engine inputs to use instead of the schedule's own, when the host
 * has asked to see everything. Spread over the normal input so the two callers
 * cannot disagree about which fields the mode touches.
 */
export function hostAnyTimeSlotInput(): {
  windows: EngineWindow[];
  overrides: never[];
  minNoticeMin: number;
} {
  return { windows: hostAnyTimeWindows(), overrides: [], minNoticeMin: 0 };
}
