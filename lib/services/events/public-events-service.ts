// lib/services/events/public-events-service.ts
//
// THE GATEKEEPER for the public events listing (app/(public)/events-at-jkkn).
//
// WHAT THIS PAGE LISTS, AND WHY IT IS NEARLY EMPTY (Director's ruling,
// 2026-09-13). It lists events whose `visibility` column says `public` — and
// nothing else. Not every row an anonymous key happens to be able to read.
// Measured on production the day of the ruling: of the 21 anon-readable events,
// 14 are `institution`, 5 are `all_jkkn` and 2 are `public`. So this page shows
// two cards today, and that is the intended outcome: "public" has to mean
// somebody chose it, not that a policy forgot to exclude it.
//
// The near-empty page is therefore the NORMAL state, not a fault. The listing
// copy is written for a visitor who finds nothing open, and it never implies the
// page is broken.
//
// This also settles School of Influence without a special case. The standing
// ruling (2026-08-13, quoted in public-programme-service.ts) is that SoI is for
// JKKN learners and senior learners only and must never be advertised to the
// public. The SoI event is `visibility = 'institution'`, so the ruling above
// removes it by the ordinary rule, with no name-checking anywhere in this file.
//
// IT WIDENS NOTHING. No policy, no grant, no RLS change accompanies this file.
// The listing is read with the ANON key, so `events_public_read`
// (supabase/setup/03_policies.sql: is_public = true AND status NOT IN
// ('draft','cancelled')) stays a live database-side gate rather than a
// decoration. `visibility` is ALREADY anon-readable and anon-filterable —
// verified with the public key against production — so narrowing to
// `visibility = 'public'` needed no grant and got none. Narrowing never does.
//
// FIELDS THE PAGE WOULD HAVE LIKED AND DOES NOT GET, because anon cannot read
// them and the answer to that is to drop the field, never to open it up:
//   * the college name  — `institutions` refuses anon (42501, permission denied
//                         for function user_has_permission), so no card names a
//                         college.
//   * places left       — `events_registrations` returns zero rows to anon, so a
//                         "N registered" line would be a confident lie.
//   * the form's own window — `event_registration_forms` refuses anon (42501).
//                         See "THE SECOND READ" below for how the card avoids
//                         offering a registration that this unreadable table
//                         would refuse.
//
// THE SECOND READ — how a card knows a door is actually open. A "Register"
// button that lands on "the organizer has not opened a registration form for
// this event yet" is a listing teaching a visitor not to trust it. Anon cannot
// see registration forms, and the fix for that is NOT to let it: `openDoors()`
// asks that question server-side with the service-role key, reads two columns
// from two tables, and returns nothing but a set of event ids. The credential
// never reaches the browser, nothing derived from it is rendered beyond a
// button's presence, and the destination page (app/p/event/[id]/register)
// already reads those same tables with the same key. When the check cannot run,
// every card degrades to an announcement with no button — fail closed.
//
// DEFAULT CLOSED, five ways:
//   1. events.is_public is the product's own flag, checked in the policy.
//   2. The anon RLS policy is the real gate — the key cannot bypass it.
//   3. listPublic() re-filters is_public and the draft/cancelled statuses in
//      front of the policy.
//   4. visibility = 'public' narrows it further, to what somebody chose.
//   5. Columns are named explicitly, never select('*'), so a column added to
//      `events` later cannot arrive on a public page just by existing.
//
// FAIL CLOSED: any read error returns an empty list. An outage renders the
// "nothing open right now" state, never a partial one.
//
// PRIVACY: event-level facts only. Nothing returned here names or counts a
// person.
//
// Pattern: lib/services/programmes/public-programme-service.ts — the proven
// precedent for a single public gatekeeper reading through the anon client.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isFormOpen } from '@/types/tournament';

const LOG_PREFIX = '[public-events]';

/**
 * The exact column list a public reader may see. Every one of these is already
 * anon-readable through `events_public_read`. Adding a column to `events` does
 * NOT add it here — that is the point.
 */
const PUBLIC_COLUMNS =
  'id, name, description, event_type, event_date, start_date, end_date, start_time, end_time, venue, venue_text, registration_open_date, registration_close_date';

/** Hard ceiling on one read. A public route must stay bounded. */
const PAGE_LIMIT = 200;

/** Statuses `events_public_read` already withholds. Re-stated in front of it. */
const HIDDEN_STATUSES = ['draft', 'cancelled'] as const;

/**
 * The one value of `events.visibility` that means "anyone may be told about
 * this". `institution` and `all_jkkn` are internal audiences that happen to sit
 * behind an anon-readable policy; neither is an invitation to the public.
 */
const PUBLIC_VISIBILITY = 'public';

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
  /** True while today sits inside the event's own run of days, in India. */
  isOnNow: boolean;
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
 * Which public door an event type registers through, if any.
 *
 * This is not a guess — app/p/event/[id]/register/page.tsx keeps the matching
 * rules and each branch below mirrors one of its refusals:
 *
 *   sports_tournament   → /p/tournament/[id]/register, itself locked to
 *                         .eq('event_type','sports_tournament'). The general
 *                         page answers it with "Wrong registration link".
 *   marathon            → nothing public exists. No /p/marathon route, and the
 *                         tournament page's type lock excludes it.
 *   school_of_influence → the general page hands it to /events/[id]/apply,
 *                         which is inside the authenticated group because an
 *                         application must be tied to the applicant's own
 *                         account. A public "Register" button on it would be an
 *                         invitation a logged-out visitor cannot accept.
 *
 * Every other type goes to the general page.
 */
type Door =
  | { kind: 'general' }
  | { kind: 'tournament' }
  | { kind: 'closed'; note: string };

function doorFor(eventType: string | null): Door {
  if (eventType === 'sports_tournament') return { kind: 'tournament' };
  if (eventType === 'marathon') {
    return { kind: 'closed', note: 'Entries for this one are handled by the organisers.' };
  }
  if (eventType === 'school_of_influence') {
    return { kind: 'closed', note: 'JKKN learners apply for this from inside their own account.' };
  }
  return { kind: 'general' };
}

/**
 * A date or timestamp reduced to the calendar day it names IN INDIA.
 *
 * Both halves of every comparison in this file are Indian calendar days. That
 * is not decoration: `events.start_date` and `end_date` are timestamptz and
 * arrive from PostgREST rendered in UTC, so slicing the first ten characters
 * reads 2026-09-10T19:00:00+00:00 as the 10th when in India it is already the
 * 11th — an evening event would be filed as past a day early, every time.
 * `event_date` is a bare DATE and already names a calendar day, so it is taken
 * as written rather than pushed through a timezone it never had.
 */
function dayOf(value: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();

  const bareDate = /^(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (bareDate) return bareDate[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  // 'en-CA' is the locale that formats as YYYY-MM-DD, which is what makes these
  // day strings comparable with a plain < or >.
  return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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
 * Which event ids can actually take a registration right now.
 *
 * `general` — an `event_registration_forms` row that isFormOpen() this moment.
 *             That is the same decision the registration page makes with the
 *             same helper, so the button and the page cannot disagree.
 * `tournament` — at least one active `tournament_divisions` row, which is what
 *             /p/tournament/[id]/register requires before it renders anything.
 *
 * Returns null when the question could not be answered at all. A caller that
 * gets null must offer no registration link: an unverified invitation is the
 * defect this exists to remove.
 */
export interface OpenDoors {
  general: Set<string>;
  tournament: Set<string>;
}

interface DoorCandidate {
  id: string;
  kind: 'general' | 'tournament';
}

async function openDoors(
  admin: SupabaseClient,
  candidates: DoorCandidate[],
): Promise<OpenDoors | null> {
  const generalIds = candidates.filter((c) => c.kind === 'general').map((c) => c.id);
  const tournamentIds = candidates.filter((c) => c.kind === 'tournament').map((c) => c.id);

  const general = new Set<string>();
  const tournament = new Set<string>();

  try {
    if (generalIds.length > 0) {
      const { data, error } = await admin
        .from('event_registration_forms')
        .select('event_id, is_enabled, starts_at, ends_at')
        .in('event_id', generalIds);
      if (error) {
        console.error(`${LOG_PREFIX} registration-form check failed:`, error.message);
        return null;
      }
      const now = new Date();
      for (const form of (data ?? []) as Array<{
        event_id: string;
        is_enabled: boolean | null;
        starts_at: string | null;
        ends_at: string | null;
      }>) {
        if (isFormOpen(form, now)) general.add(form.event_id);
      }
    }

    if (tournamentIds.length > 0) {
      const { data, error } = await admin
        .from('tournament_divisions')
        .select('event_id')
        .eq('is_active', true)
        .in('event_id', tournamentIds);
      if (error) {
        console.error(`${LOG_PREFIX} tournament-division check failed:`, error.message);
        return null;
      }
      for (const division of (data ?? []) as Array<{ event_id: string }>) {
        tournament.add(division.event_id);
      }
    }
  } catch (err) {
    console.error(
      `${LOG_PREFIX} registration-door check threw:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  return { general, tournament };
}

/**
 * What the card may offer, before the door check.
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
): { href: string | null; note: string | null; candidate: DoorCandidate | null } {
  // An event that is over needs no explanation — the section it sits in is the
  // explanation.
  if (isPast) return { href: null, note: null, candidate: null };

  const opensOn = dayOf(row.registration_open_date);
  if (opensOn && opensOn > today) {
    const label = formatDay(opensOn);
    return {
      href: null,
      note: label ? `Registration opens on ${label}.` : 'Registration has not opened yet.',
      candidate: null,
    };
  }

  const closesOn = dayOf(row.registration_close_date);
  if (closesOn && closesOn < today) {
    return { href: null, note: 'Registration has closed.', candidate: null };
  }

  const door = doorFor(row.event_type);
  if (door.kind === 'closed') return { href: null, note: door.note, candidate: null };
  if (door.kind === 'tournament') {
    return {
      href: `/p/tournament/${row.id}/register`,
      note: null,
      candidate: { id: row.id, kind: 'tournament' },
    };
  }
  return {
    href: `/p/event/${row.id}/register`,
    note: null,
    candidate: { id: row.id, kind: 'general' },
  };
}

export class PublicEventsService {
  /**
   * Every event somebody chose to make public, ordered for reading: what is on
   * now or still to come first, soonest first; then what has happened, most
   * recent first.
   *
   * `admin` is the service-role client used ONLY by openDoors() above, and only
   * to decide whether a "Register" button may appear. Omit it and no card
   * offers one — which is the correct answer when the check cannot be made.
   *
   * Returns [] when nothing is public, and when the read fails. Both are the
   * same thing to a reader: there is nothing to show.
   */
  static async listPublic(
    supabase: SupabaseClient,
    admin?: SupabaseClient | null,
  ): Promise<PublicEvent[]> {
    let query = supabase
      .from('events')
      .select(PUBLIC_COLUMNS)
      // In front of the policy, not instead of it.
      .eq('is_public', true)
      // The Director's ruling: only what somebody chose to make public.
      .eq('visibility', PUBLIC_VISIBILITY);

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

    const rows = ((data ?? []) as unknown as EventRow[]).map((row) => {
      // event_date stands in for either end when the range columns are empty —
      // one production row (a marathon) carries only event_date.
      const startDay = dayOf(row.start_date) ?? dayOf(row.event_date);
      const endDay = dayOf(row.end_date) ?? dayOf(row.event_date) ?? startDay;
      // An undated event is NOT treated as past. Being unable to date it is not
      // evidence that it is over, and hiding it would be a guess.
      const isPast = endDay !== null && endDay < today;
      const isOnNow = !isPast && startDay !== null && startDay <= today;
      const registration = resolveRegistration(row, isPast, today);

      return {
        row,
        startDay,
        endDay,
        isPast,
        isOnNow,
        registration,
      };
    });

    // The door check runs once for the whole page, not once per card.
    const candidates = rows
      .map((r) => r.registration.candidate)
      .filter((c): c is DoorCandidate => c !== null);
    let doors: OpenDoors | null = null;
    if (candidates.length > 0) {
      if (admin) {
        doors = await openDoors(admin, candidates);
      } else {
        console.error(
          `${LOG_PREFIX} no service-role client supplied — no registration link can be verified, so none is offered.`,
        );
      }
    }

    const events = rows.map(({ row, startDay, endDay, isPast, isOnNow, registration }) => {
      let registerHref = registration.href;
      let registerNote = registration.note;

      if (registration.candidate) {
        const open =
          doors !== null &&
          (registration.candidate.kind === 'general'
            ? doors.general.has(registration.candidate.id)
            : doors.tournament.has(registration.candidate.id));
        if (!open) {
          registerHref = null;
          // When the check itself could not run we know nothing, and saying
          // "closed" would be a guess. The card simply announces the event.
          registerNote = doors === null ? null : 'Registration is not open for this one yet.';
        }
      }

      return {
        id: row.id,
        name: row.name,
        // Descriptions are shown on what is still to come and withheld from the
        // archive. These are internal notes that were never written for an
        // outside reader — one production row opens "Retro-loaded …" — and they
        // sit on the historical rows. An archive is a list of what happened, so
        // it loses nothing by being terse.
        summary: isPast ? null : (row.description?.trim() || null),
        whenLabel: formatWhen(startDay, endDay, row),
        whereLabel: row.venue?.trim() || row.venue_text?.trim() || null,
        isPast,
        isOnNow,
        registerHref,
        registerNote,
        // Kept out of the returned object; sorting only.
        //
        // "Coming up" must not open with something that began three weeks ago.
        // An event already running is the most immediate thing on the page, so
        // it sorts to today and is labelled "Happening now" rather than being
        // filed under its own start date behind next month's lecture.
        _sortKey: isOnNow ? today : (startDay ?? endDay ?? '9999-12-31'),
        _tieKey: endDay ?? startDay ?? '',
      };
    });

    const upcoming = events
      .filter((e) => !e.isPast)
      .sort(
        (a, b) =>
          a._sortKey.localeCompare(b._sortKey) ||
          a._tieKey.localeCompare(b._tieKey) ||
          a.name.localeCompare(b.name),
      );
    const past = events
      .filter((e) => e.isPast)
      .sort((a, b) => b._sortKey.localeCompare(a._sortKey) || a.name.localeCompare(b.name));

    return [...upcoming, ...past].map(({ _sortKey, _tieKey, ...event }) => {
      void _sortKey;
      void _tieKey;
      return event;
    });
  }
}
