// Public event registration page — what it asks the database for, and what a
// visitor is told when the event has been called off.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Two rulings live here, and they pull in the same direction.
//
// 1. "SHORT PUBLIC LINE, FULL REASON KEPT INSIDE" (Director, 13 Sep). The
//    organiser's typed reason is written at the worst moment of an event's
//    life, with no review step, and it used to be published verbatim to anyone
//    holding the link. The public now gets a plain, standard sentence and
//    somewhere to ask.
//
// 2. "KEEP THE REASON OUT OF THE PUBLIC TABLE ENTIRELY" (Director, 13 Sep).
//    Not printing it was not enough. `events_public_read` has no TO clause and
//    `is_public` defaults to true, so `events` is anon-readable — and the reason
//    is KEPT when an event is reinstated. A column on `events` would therefore
//    have published the text to the public anon key the moment a cancelled
//    event went live again, with no page printing it and nothing to notice. So
//    the reason is not a column on `events` at all: it is a row in
//    `public.event_cancellations`, which `anon` holds no grant on and no policy
//    names. See migration 20261204113700.
//
// WHAT THAT MEANS FOR THIS FILE. `cancellation_reason`, `cancelled_at` and
// `cancelled_by` are not columns on `events` — not now, and not after the
// migration is applied. Naming one in this page's select would be a permanent
// 42703 (`{"code":"42703","message":"column events.cancellation_reason does not
// exist"}`, HTTP 400, no rows), which fails the ENTIRE select and would turn
// public registration into "Registration not available" for every event. This
// page reads no cancellation data at all, from any table.
//
// Nothing is lost by the organiser: the reason is still stored exactly as
// typed, and the /events/[id] console still shows it in full to colleagues at
// the institution who can open the event.

/**
 * Columns the registration page needs to decide whether it can take a
 * registration.
 *
 * DO NOT ADD `cancellation_reason`, `cancelled_at` or `cancelled_by` HERE.
 * They are not columns on `events` and are never going to be — they live in
 * `public.event_cancellations`, deliberately out of reach of the public key.
 * Naming one here is a permanent 42703, and one missing column fails the whole
 * select, which would break public registration for every event.
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
