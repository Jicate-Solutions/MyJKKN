// lib/services/events/public-events-service.ts
//
// THE GATEKEEPER for the public events listing (app/(public)/events-at-jkkn).
//
// WHY THIS EXISTS. 25 events on production are flagged public and 21 of them are
// already readable by a logged-out visitor — and until now nothing linked to a
// single one. The only route to /p/event/[id]/register was a staff member
// pasting a UUID by hand, which is why 8 of 55 events have ever taken a
// registration and why 1,547 of 2,191 registrations are a bulk upload rather
// than a person signing themselves up. This module does not open any new door;
// it makes the doors that were already open findable.
//
// IT WIDENS NOTHING. No policy, no grant, no RLS change accompanies this file.
// The page reads with the ANON key, so `events_public_read`
// (supabase/setup/03_policies.sql: is_public = true AND status NOT IN
// ('draft','cancelled')) stays a live database-side gate rather than a
// decoration, and a service-role credential never reaches an unauthenticated
// route. Verified against production before and after with the public anon key:
// the column list below returns the same 21 rows the policy already exposed.
//
// FIELDS THE PAGE WOULD HAVE LIKED AND DOES NOT GET, because anon cannot read
// them and the answer to that is to drop the field, never to open it up:
//   * the college name  — `institutions` refuses anon (42501, permission denied
//                         for function user_has_permission), so no card names a
//                         college.
//   * places left       — `events_registrations` returns zero rows to anon, so a
//                         "N registered" line would be a confident lie.
//   * the form's own window — `event_registration_forms` refuses anon (42501),
//                         so this module can only honour the window recorded on
//                         the EVENT. A form may still be closed behind an open
//                         event; the registration page is the authority and says
//                         so itself.
//
// DEFAULT CLOSED, the same four ways as the programme catalogue:
//   1. events.is_public is the product's own flag, checked in the policy.
//   2. The anon RLS policy is the real gate — the key cannot bypass it.
//   3. listPublic() re-filters is_public and the draft/cancelled statuses in
//      front of the policy.
//   4. Columns are named explicitly, never select('*'), so a column added to
//      `events` later cannot arrive on a public page just by existing.
//
// FAIL CLOSED: any read error returns an empty list. An outage renders the
// "nothing listed right now" state, never a partial one.
//
// PRIVACY: event-level facts only. Nothing returned here names or counts a
// person.
//
// Pattern: lib/services/programmes/public-programme-service.ts — the proven
// precedent for a single public gatekeeper reading through the anon client.

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[public-events]';

/**
 * The exact column list a public reader may see. Every one of these is already
 * anon-readable through `events_public_read`. Adding a column to `events` does
 * NOT add it here — that is the point.
 */
const PUBLIC_COLUMNS =
  'id, name, description, event_type, event_date, start_date, end_date, start_time, end_time, venue, venue_text, registration_open_date, registration_close_date';

/** Hard ceiling on one read. A public force-dynamic route must stay bounded. */
const PAGE_LIMIT = 200;

/** Statuses `events_public_read` already withholds. Re-stated in front of it. */
const HIDDEN_STATUSES = ['draft', 'cancelled'] as const;

export interface PublicEvent {
  id: string;
  /** Event name, as the institution recorded it. */
  name: string;
  /** One-line description. Null on past events — see listPublic(). */
  summary: string | null;
  /** '18 August 2026', '18 August – 7 September 2026', or null when undated. */
  whenLabel: string | null;
  /** Venue in plain words, or null when none was recorded. */
  whereLabel: string | null;
  /** True once the event's last day is behind us, in India. */
  isPast: boolean;
  /** Where a visitor may register RIGHT NOW. Null means: do not invite them. */
  registerHref: string | null;
  /** Why there is no link, in plain words. Null when there is a link, or when
   *  the event is simply over and the section heading already says so. */
  registerNote: string | null;
}

interface EventRow {
  id: string;
  name: string;
  description: string | null;
  event_type: string | null;
  event_date: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  venue_text: string | null;
  registration_open_date: string | null;
  registration_close_date: string | null;
}

/**
 * Event types that register somewhere OTHER than /p/event/[id]/register.
 *
 * This is not a guess. app/p/event/[id]/register/page.tsx keeps its own
 * HAS_OWN_PUBLIC_PAGE set and answers a sports_tournament or a marathon with
 * "Wrong registration link — ask the organizer", so sending either there from a
 * listing would be sending a visitor to a dead end we already know about.
 *
 *   sports_tournament → /p/tournament/[id]/register, which is itself locked to
 *                       .eq('event_type', 'sports_tournament').
 *   marathon          → nothing public exists. There is no /p/marathon route,
 *                       and the tournament page's type lock excludes it. So the
 *                       honest answer is a note, not a link.
 *
 * Every other type — lecture, cultural, induction, convocation, sports,
 * school_of_influence — goes to the general page. school_of_influence is
 * deliberately included: that page recognises it and hands the reader the
 * application route with an explanation, which is more use than silence.
 */
function ownPublicDoor(eventType: string | null, id: string): { href: string | null; note: string | null } | null {
  if (eventType === 'sports_tournament') {
    return { href: `/p/tournament/${id}/register`, note: null };
  }
  if (eventType === 'marathon') {
    return { href: null, note: 'Entries for this one are handled by the organisers.' };
  }
  return null;
}

/** A timestamp, date or null reduced to the calendar day it names. */
function dayOf(value: string | null): string | null {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Today as 'YYYY-MM-DD' in India, which is the calendar these dates mean. */
function todayInIndia(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** 'YYYY-MM-DD' → '18 August 2026'. Parsed as UTC so the day never shifts. */
function formatDay(iso: string, withYear = true): string | null {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** '09:00:00' → '9:00 am'. Anything unparseable is dropped, never guessed. */
function formatTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value));
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour > 23) return null;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${match[2]} ${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * When it is, in one line.
 *
 * Times are shown only on a single-day event. On a run of days a start time
 * belongs to the first day alone, and printing it beside a date range reads as
 * if it applied to all of them.
 */
function formatWhen(startDay: string | null, endDay: string | null, row: EventRow): string | null {
  if (!startDay && !endDay) return null;
  if (startDay && endDay && startDay !== endDay) {
    const sameYear = startDay.slice(0, 4) === endDay.slice(0, 4);
    const from = formatDay(startDay, !sameYear);
    const to = formatDay(endDay);
    return from && to ? `${from} – ${to}` : (from ?? to);
  }

  const single = formatDay((startDay ?? endDay)!);
  if (!single) return null;

  const startsAt = formatTime(row.start_time);
  if (!startsAt) return single;
  const endsAt = formatTime(row.end_time);
  return endsAt ? `${single}, ${startsAt} – ${endsAt}` : `${single}, ${startsAt}`;
}

/**
 * What the card may offer.
 *
 * The window on the EVENT is checked before the type routing, deliberately: an
 * event past its registration_close_date must not invite a registration that
 * the registration page will refuse (which it does, with "Registration closed").
 * A listing that keeps offering the button is how a visitor learns not to trust
 * the page.
 */
function resolveRegistration(
  row: EventRow,
  isPast: boolean,
  today: string,
): { registerHref: string | null; registerNote: string | null } {
  // An event that is over needs no explanation — the section it sits in is the
  // explanation.
  if (isPast) return { registerHref: null, registerNote: null };

  const opensOn = dayOf(row.registration_open_date);
  if (opensOn && opensOn > today) {
    const label = formatDay(opensOn);
    return {
      registerHref: null,
      registerNote: label ? `Registration opens on ${label}.` : 'Registration has not opened yet.',
    };
  }

  const closesOn = dayOf(row.registration_close_date);
  if (closesOn && closesOn < today) {
    return { registerHref: null, registerNote: 'Registration has closed.' };
  }

  const door = ownPublicDoor(row.event_type, row.id);
  if (door) return { registerHref: door.href, registerNote: door.note };

  return { registerHref: `/p/event/${row.id}/register`, registerNote: null };
}

export class PublicEventsService {
  /**
   * Every event a logged-out visitor may already see, ordered for reading:
   * what is still to come first, soonest first; then what has happened, most
   * recent first.
   *
   * Returns [] when nothing is public, and when the read fails. Both are the
   * same thing to a reader: there is nothing to show.
   */
  static async listPublic(supabase: SupabaseClient): Promise<PublicEvent[]> {
    let query = supabase
      .from('events')
      .select(PUBLIC_COLUMNS)
      // In front of the policy, not instead of it.
      .eq('is_public', true);

    for (const status of HIDDEN_STATUSES) {
      query = query.neq('status', status);
    }

    const { data, error } = await query
      .order('start_date', { ascending: true, nullsFirst: false })
      .order('event_date', { ascending: true, nullsFirst: false })
      .limit(PAGE_LIMIT);

    if (error) {
      console.error(`${LOG_PREFIX} listing read failed:`, error.message);
      return []; // fail closed
    }

    const today = todayInIndia();

    const events = ((data ?? []) as unknown as EventRow[]).map((row) => {
      // event_date stands in for either end when the range columns are empty —
      // one production row (a marathon) carries only event_date.
      const startDay = dayOf(row.start_date) ?? dayOf(row.event_date);
      const endDay = dayOf(row.end_date) ?? dayOf(row.event_date) ?? startDay;
      // An undated event is NOT treated as past. Being unable to date it is not
      // evidence that it is over, and hiding it would be a guess.
      const isPast = endDay !== null && endDay < today;
      const { registerHref, registerNote } = resolveRegistration(row, isPast, today);

      return {
        id: row.id,
        name: row.name,
        // Descriptions are shown on what is still to come and withheld from the
        // archive. These are internal notes that were never written for an
        // outside reader — one production row opens "Retro-loaded from JKKN
        // Events Team chat" — and they sit on the historical rows. An archive
        // is a list of what happened, so it loses nothing by being terse.
        summary: isPast ? null : (row.description?.trim() || null),
        whenLabel: formatWhen(startDay, endDay, row),
        whereLabel: row.venue?.trim() || row.venue_text?.trim() || null,
        isPast,
        registerHref,
        registerNote,
        // Kept out of the returned object; sorting only.
        _sortKey: startDay ?? endDay ?? '',
      };
    });

    const upcoming = events.filter((e) => !e.isPast).sort((a, b) => a._sortKey.localeCompare(b._sortKey));
    const past = events.filter((e) => e.isPast).sort((a, b) => b._sortKey.localeCompare(a._sortKey));

    return [...upcoming, ...past].map(({ _sortKey, ...event }) => {
      void _sortKey;
      return event;
    });
  }
}
