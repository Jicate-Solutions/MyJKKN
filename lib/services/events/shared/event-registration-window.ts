// lib/services/events/shared/event-registration-window.ts
// Is this event accepting registrations right now?
//
// PURE — no Supabase, no DOM, no clock of its own (`now` is injectable). Both
// the API route and the registrant page call this, so the server's decision and
// the message the registrant reads can never disagree.
//
// The rule matches the tournament public page: a non-draft, non-cancelled event
// inside its registration window. Blank dates mean "no limit" — most events
// never set them.

const CLOSED_STATUSES = ['draft', 'cancelled'];

export type WindowState =
  | { open: true }
  | { open: false; reason: 'not_available' | 'not_yet' | 'closed'; message: string };

export interface RegistrationWindowInput {
  status?: string | null;
  registration_open_date?: string | null;
  registration_close_date?: string | null;
}

/** '2026-08-05T00:00:00Z' → '5 August 2026'. */
function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** A parseable Date, or null. An unparseable stored date must not lock everyone out. */
function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function checkRegistrationWindow(
  event: RegistrationWindowInput,
  now: Date = new Date()
): WindowState {
  // Status first: a draft inside its window is still not available.
  if (event.status && CLOSED_STATUSES.includes(event.status)) {
    return {
      open: false,
      reason: 'not_available',
      message: 'Registration is not available for this event.',
    };
  }

  const opens = parseDate(event.registration_open_date);
  if (opens && now < opens) {
    return {
      open: false,
      reason: 'not_yet',
      message: `Registration opens on ${formatLongDate(event.registration_open_date as string)}.`,
    };
  }

  const closes = parseDate(event.registration_close_date);
  if (closes && now > closes) {
    return {
      open: false,
      reason: 'closed',
      message: 'Registration has closed.',
    };
  }

  return { open: true };
}
