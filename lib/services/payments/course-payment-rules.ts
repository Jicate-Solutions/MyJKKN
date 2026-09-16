// Shared between the /my-courses client UI and the initiate route so the
// client-side validation message and the server-side rejection never drift
// apart. The server re-validates independently — this constant only saves
// the participant a round trip to discover the floor.

/**
 * Below this, a partial amount against one instalment is rejected — unless
 * it clears that instalment's balance entirely, in which case any amount is
 * allowed so a small tail balance can always be paid off.
 */
export const MIN_PARTIAL_COURSE_PAYMENT = 5000;
