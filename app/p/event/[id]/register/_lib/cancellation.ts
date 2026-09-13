// Public event registration page — what it asks the database for, and what a
// visitor is told when the event has been called off.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Two separate rules live here, and they pull in the same direction.
//
// 1. DEPLOY ORDER. Code ships before migrations in this repo. A deploy can land
//    minutes or days before an operator applies
//    `20261204113700_events_cancellation_reason_and_stamp.sql`. PostgREST fails
//    an ENTIRE select when one named column is missing —
//    `{"code":"42703","message":"column events.cancellation_reason does not
//    exist"}`, HTTP 400, no rows — so naming `cancellation_reason` /
//    `cancelled_at` in this page's select would, on today's production schema,
//    return no row for EVERY event and turn the public registration page into
//    "Registration not available" for all 55 of them.
//
// 2. THE DIRECTOR'S RULING, 13 Sep: "Short public line, full reason kept
//    inside." The organiser's typed reason is written at the worst moment of an
//    event's life, with no review step, and it used to be published verbatim to
//    anyone holding the link. It is now internal to the event team. The public
//    gets a plain, standard sentence and somewhere to ask.
//
// Rule 2 makes rule 1 free: this page no longer reads the cancellation columns
// AT ALL — not in the main select, and not in a second best-effort query
// either. There is nothing left on this path that a missing column can break.
//
// Nothing is lost by the organiser: `cancellation_reason` is still written
// exactly as typed, and the event console still shows it in full to team
// members.

/**
 * Columns the registration page needs to decide whether it can take a
 * registration.
 *
 * DO NOT ADD `cancellation_reason`, `cancelled_at` or `cancelled_by` HERE.
 * They are not on production yet, and one missing column fails the whole
 * select (42703), which would break public registration for every event. They
 * are also no longer public information — see the ruling above.
 * `__tests__/events/events-cancellation.test.ts` fails if they are added back.
 *
 * ONE STRING LITERAL, NOT A CONCATENATION. supabase-js infers the row type from
 * the literal type of the argument to `.select()`; `'a, b' + 'c'` widens to
 * `string`, the generic falls back to `GenericStringError`, and every field read
 * off the result becomes a TS2339. Keep it on one line however long it gets.
 */
export const PUBLIC_EVENT_COLUMNS =
  'id, name, event_type, status, event_date, start_date, venue, venue_text, registration_open_date, registration_close_date, max_registrations';

/**
 * Where a member of the public is sent with a question about a cancelled event.
 *
 * The `events` table carries no per-event contact — `contact_phone` belongs to
 * `event_proposals`, a different table with a different lifetime — so this is
 * the institution-wide address already published on /privacy, /terms and
 * /data-deletion. One address the public already sees elsewhere beats a guess
 * at a departmental mailbox that may not be read.
 */
export const PUBLIC_CANCELLATION_CONTACT_EMAIL = 'support@jkkn.ac.in';

/**
 * The whole of what a cancellation says in public. Standard, identical for
 * every event, written in advance rather than at 11pm by whoever is holding the
 * phone.
 *
 * Deliberately NOT a template that interpolates the organiser's words. The
 * moment this file formats free text into the public page again, the ruling is
 * gone.
 */
export const PUBLIC_CANCELLATION_NOTICE = {
  /** The one fact the visitor came for. */
  headline: 'This event has been cancelled',
  /** No further entries — said plainly, so nobody waits for the form to reopen. */
  body: 'No further registrations are being accepted for this event.',
  /** What happens to an entry already made. True regardless of the reason. */
  alreadyRegistered:
    'If you already registered, your entry has not been removed — the organiser still has your details.',
  /** Somewhere to ask, because the reason is no longer printed here. */
  contactPrompt: 'For anything else about this event, please write to',
} as const;
