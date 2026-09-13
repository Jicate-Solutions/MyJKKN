// __tests__/lib/services/public-events-service.test.ts
//
// Guards the three rules that keep this listing honest:
//   1. It lists only what somebody CHOSE to make public — visibility='public',
//      not merely every row an anonymous key can read (Director, 2026-09-13).
//   2. It reads NOTHING an anonymous visitor could not already read — the same
//      table, the same flag, a named column list, and never select('*').
//   3. It never invites a registration that the registration page will refuse,
//      which now includes verifying that a registration form or a tournament
//      division actually exists before a button is rendered.
//
// These assert the TypeScript gatekeeper's own behaviour against a recording
// stub. They do not re-implement the RLS policy, and they are not evidence about
// it — `events_public_read` lives in supabase/setup/03_policies.sql and this PR
// does not touch it.
//
// Every date literal is fixed and either FAR IN THE PAST or FAR IN THE FUTURE on
// purpose. "Realistic" fixtures quietly cross the past/upcoming boundary on a
// calendar date and turn a green suite red on a day nobody changed any code.

import { describe, it, expect } from 'vitest';
import { PublicEventsService } from '@/lib/services/events/public-events-service';

type QueryResult = { data: unknown; error: { message: string } | null };

/** Minimal recording stand-in for the PostgREST builder chain. */
function makeClient(result: QueryResult) {
  const calls = {
    from: [] as string[],
    select: [] as string[],
    eq: [] as Array<[string, unknown]>,
    neq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown]>,
    order: [] as string[],
    limit: [] as number[],
  };
  const builder: Record<string, unknown> = {
    select(columns: string) {
      calls.select.push(columns);
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.eq.push([column, value]);
      return builder;
    },
    neq(column: string, value: unknown) {
      calls.neq.push([column, value]);
      return builder;
    },
    in(column: string, values: unknown) {
      calls.in.push([column, values]);
      return builder;
    },
    order(column: string) {
      calls.order.push(column);
      return builder;
    },
    limit(count: number) {
      calls.limit.push(count);
      return builder;
    },
    then(onFulfilled: (value: QueryResult) => unknown) {
      return Promise.resolve(result).then(onFulfilled);
    },
  };
  const client = {
    from(table: string) {
      calls.from.push(table);
      return builder;
    },
  };
  return { client: client as never, calls };
}

/**
 * The service-role stand-in used ONLY for the door check: "is there an open
 * registration form / an active division for this event?" It answers per table
 * and records what was asked, so a test can assert that this client is never
 * pointed at anything else.
 */
function makeAdmin(tables: Record<string, QueryResult>) {
  const calls = { from: [] as string[], select: [] as string[], in: [] as Array<[string, unknown]> };
  const client = {
    from(table: string) {
      calls.from.push(table);
      const result = tables[table] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {
        select(columns: string) {
          calls.select.push(columns);
          return builder;
        },
        eq() {
          return builder;
        },
        in(column: string, values: unknown) {
          calls.in.push([column, values]);
          return builder;
        },
        then(onFulfilled: (value: QueryResult) => unknown) {
          return Promise.resolve(result).then(onFulfilled);
        },
      };
      return builder;
    },
  };
  return { admin: client as never, calls };
}

const FUTURE = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Seminar on Logistics',
  description: 'An afternoon on supply chains, open to visitors.',
  event_type: 'lecture',
  event_date: null,
  start_date: '2099-03-04T00:00:00+00:00',
  end_date: '2099-03-04T00:00:00+00:00',
  start_time: '09:30:00',
  end_time: '15:30:00',
  venue: null,
  venue_text: 'Main Auditorium',
  registration_open_date: null,
  registration_close_date: null,
};

const PAST = {
  ...FUTURE,
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Annual Cultural Day (Retro)',
  description: 'Retro-loaded from an internal chat — never written for a reader.',
  start_date: '2000-12-05T00:00:00+00:00',
  end_date: '2000-12-05T00:00:00+00:00',
};

/** An open form for the given event — the ordinary "a door exists" fixture. */
const openFormFor = (eventId: string) => ({
  data: [{ event_id: eventId, is_enabled: true, starts_at: null, ends_at: null }],
  error: null,
});

describe('PublicEventsService.listPublic — only what somebody chose to make public', () => {
  it('lists visibility=public and nothing else', async () => {
    // 21 events are anon-readable on production; 14 are 'institution' and 5 are
    // 'all_jkkn'. Those are internal audiences behind an anon-readable policy,
    // not invitations to the public. A near-empty page is the correct outcome.
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicEventsService.listPublic(client);

    expect(calls.eq).toContainEqual(['visibility', 'public']);
  });

  it('filters in the database, so an internal-audience row never reaches the page', async () => {
    // Standing ruling 2026-08-13: School of Influence is for JKKN learners and
    // senior learners. Its event row is visibility='institution', so the filter
    // above removes it — there is deliberately no title or event-type exclusion
    // list anywhere in this service, because a special case is a rule that only
    // works until the next programme needs one.
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicEventsService.listPublic(client);

    const visibilityFilters = calls.eq.filter(([column]) => column === 'visibility');
    expect(visibilityFilters).toEqual([['visibility', 'public']]);
  });
});

describe('PublicEventsService.listPublic — the public gate', () => {
  it('reads only the events table, and only the rows the public policy exposes', async () => {
    const { client, calls } = makeClient({ data: [FUTURE], error: null });
    await PublicEventsService.listPublic(client);

    expect(calls.from).toEqual(['events']);
    expect(calls.eq).toContainEqual(['is_public', true]);
    expect(calls.neq).toContainEqual(['status', 'draft']);
    expect(calls.neq).toContainEqual(['status', 'cancelled']);
  });

  it('caps the read — a public route must not become unbounded', async () => {
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicEventsService.listPublic(client);

    expect(calls.limit).toHaveLength(1);
    expect(calls.limit[0]).toBeGreaterThan(0);
  });

  it('never selects every column — a column added to events later cannot leak by omission', async () => {
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicEventsService.listPublic(client);

    expect(calls.select).toHaveLength(1);
    expect(calls.select[0]).not.toContain('*');
    for (const column of ['id', 'name', 'event_type', 'registration_close_date']) {
      expect(calls.select[0]).toContain(column);
    }
  });

  it('asks for no column anon cannot read, and for nothing about a person', async () => {
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicEventsService.listPublic(client);

    // institutions and events_registrations both refuse anon, so the college
    // name and any head-count are off the table by construction, not by taste.
    for (const forbidden of [
      'institution_id',
      'created_by',
      'proposed_by',
      'events_registrations',
      'institutions',
      'profiles',
      'budget_estimate',
      'approval_chain_snapshot',
    ]) {
      expect(calls.select[0]).not.toContain(forbidden);
    }
  });

  it('returns an empty listing when the read fails (fail closed)', async () => {
    const { client } = makeClient({ data: null, error: { message: 'boom' } });
    expect(await PublicEventsService.listPublic(client)).toEqual([]);
  });

  it('returns an empty listing when nothing is public', async () => {
    const { client } = makeClient({ data: [], error: null });
    expect(await PublicEventsService.listPublic(client)).toEqual([]);
  });

  it('hands the page no field that could identify a person', async () => {
    const { client } = makeClient({ data: [FUTURE], error: null });
    const [event] = await PublicEventsService.listPublic(client);

    expect(Object.keys(event).sort()).toEqual(
      [
        'id',
        'isOnNow',
        'isPast',
        'name',
        'registerHref',
        'registerNote',
        'summary',
        'whenLabel',
        'whereLabel',
      ].sort(),
    );
  });
});

describe('PublicEventsService.listPublic — never invite a registration that will be refused', () => {
  it('offers the general registration page when a form is actually open', async () => {
    const { client } = makeClient({ data: [FUTURE], error: null });
    const { admin } = makeAdmin({ event_registration_forms: openFormFor(FUTURE.id) });
    const [event] = await PublicEventsService.listPublic(client, admin);

    expect(event.registerHref).toBe(`/p/event/${FUTURE.id}/register`);
    expect(event.registerNote).toBeNull();
  });

  it('offers nothing when the event has no open registration form', async () => {
    // The dead end this check exists to remove: /p/event/[id]/register answers
    // "the organizer has not opened a registration form for this event yet".
    const { client } = makeClient({ data: [FUTURE], error: null });
    const { admin } = makeAdmin({ event_registration_forms: { data: [], error: null } });
    const [event] = await PublicEventsService.listPublic(client, admin);

    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toBe('Registration is not open for this one yet.');
  });

  it('treats a form outside its window as shut, exactly as the registration page does', async () => {
    const { client } = makeClient({ data: [FUTURE], error: null });
    const { admin } = makeAdmin({
      event_registration_forms: {
        data: [{ event_id: FUTURE.id, is_enabled: true, starts_at: null, ends_at: '2000-01-01T00:00:00Z' }],
        error: null,
      },
    });
    const [event] = await PublicEventsService.listPublic(client, admin);

    expect(event.registerHref).toBeNull();
  });

  it('offers no link at all when the door cannot be checked', async () => {
    // No service-role client: the answer is unknown, so the card announces the
    // event and invites nothing. An unverified invitation is the defect.
    const { client } = makeClient({ data: [FUTURE], error: null });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toBeNull();
  });

  it('says nothing about registration when the door check itself fails', async () => {
    const { client } = makeClient({ data: [FUTURE], error: null });
    const { admin } = makeAdmin({
      event_registration_forms: { data: null, error: { message: 'nope' } },
    });
    const [event] = await PublicEventsService.listPublic(client, admin);

    expect(event.registerHref).toBeNull();
    // "Closed" would be a guess; the card simply announces the event.
    expect(event.registerNote).toBeNull();
  });

  it('asks the door question of two tables only, by event id', async () => {
    const { client } = makeClient({ data: [FUTURE], error: null });
    const { admin, calls } = makeAdmin({ event_registration_forms: openFormFor(FUTURE.id) });
    await PublicEventsService.listPublic(client, admin);

    expect(calls.from).toEqual(['event_registration_forms']);
    expect(calls.in).toEqual([['event_id', [FUTURE.id]]]);
    // Nothing about a person is read with this credential.
    for (const forbidden of ['email', 'phone', 'name', 'profiles']) {
      expect(calls.select.join(' ')).not.toContain(forbidden);
    }
  });

  it('withholds the link once registration_close_date has passed, and says so', async () => {
    const { client } = makeClient({
      data: [{ ...FUTURE, registration_close_date: '2000-01-01' }],
      error: null,
    });
    const { admin } = makeAdmin({ event_registration_forms: openFormFor(FUTURE.id) });
    const [event] = await PublicEventsService.listPublic(client, admin);

    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toBe('Registration has closed.');
    // Still listed — a closed window hides the button, never the event.
    expect(event.name).toBe(FUTURE.name);
  });

  it('names the day registration opens when it has not opened yet', async () => {
    const { client } = makeClient({
      data: [{ ...FUTURE, registration_open_date: '2099-02-01' }],
      error: null,
    });
    const { admin } = makeAdmin({ event_registration_forms: openFormFor(FUTURE.id) });
    const [event] = await PublicEventsService.listPublic(client, admin);

    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toMatch(/^Registration opens on .*February 2099\.$/);
  });

  it('sends a sports tournament to its own public door, and only once it has divisions', async () => {
    // /p/event/[id]/register answers a tournament with "Wrong registration
    // link", and the tournament page itself answers "no divisions yet" until
    // one is published. Both are dead ends a listing can see coming.
    const tournament = { ...FUTURE, event_type: 'sports_tournament' };
    const withDivisions = makeAdmin({
      tournament_divisions: { data: [{ event_id: tournament.id }], error: null },
    });
    const withNone = makeAdmin({ tournament_divisions: { data: [], error: null } });

    const [open] = await PublicEventsService.listPublic(
      makeClient({ data: [tournament], error: null }).client,
      withDivisions.admin,
    );
    const [shut] = await PublicEventsService.listPublic(
      makeClient({ data: [tournament], error: null }).client,
      withNone.admin,
    );

    expect(open.registerHref).toBe(`/p/tournament/${tournament.id}/register`);
    expect(shut.registerHref).toBeNull();
    expect(withDivisions.calls.from).toEqual(['tournament_divisions']);
  });

  it('offers a marathon no link at all, because no public one exists', async () => {
    const { client } = makeClient({ data: [{ ...FUTURE, event_type: 'marathon' }], error: null });
    const { admin } = makeAdmin({ event_registration_forms: openFormFor(FUTURE.id) });
    const [event] = await PublicEventsService.listPublic(client, admin);

    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toContain('organisers');
  });

  it('sends nobody to an application that needs a JKKN account', async () => {
    // The general registration page hands this type to /events/[id]/apply,
    // which is inside the authenticated group — a logged-out visitor cannot
    // accept that invitation, so the card does not extend it.
    const { client } = makeClient({
      data: [{ ...FUTURE, event_type: 'school_of_influence' }],
      error: null,
    });
    const { admin } = makeAdmin({ event_registration_forms: openFormFor(FUTURE.id) });
    const [event] = await PublicEventsService.listPublic(client, admin);

    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toContain('own account');
  });

  it('offers a past event nothing, and needs no excuse for it', async () => {
    const { client } = makeClient({ data: [PAST], error: null });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.isPast).toBe(true);
    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toBeNull();
  });
});

describe('PublicEventsService.listPublic — one calendar, on both sides', () => {
  it('files a late-evening Indian event under the Indian day, not the UTC one', async () => {
    // 2099-03-04T19:00Z is already the 5th in India. Slicing the ISO string
    // would read the 4th and file the event a day early against an Indian
    // "today" — the two halves of that comparison were different calendars.
    const { client } = makeClient({
      data: [
        {
          ...FUTURE,
          start_date: '2099-03-04T19:00:00+00:00',
          end_date: '2099-03-04T19:00:00+00:00',
          start_time: null,
          end_time: null,
        },
      ],
      error: null,
    });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.whenLabel).toBe('5 March 2099');
  });

  it('takes a bare DATE column as the day it already names', async () => {
    // event_date is a DATE, not a timestamptz. Pushing it through a timezone it
    // never had is how a date column moves a day.
    const { client } = makeClient({
      data: [{ ...FUTURE, start_date: null, end_date: null, event_date: '2099-04-12', start_time: null }],
      error: null,
    });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.whenLabel).toBe('12 April 2099');
  });
});

describe('PublicEventsService.listPublic — what a reader is shown', () => {
  it('puts what is still to come first, and the archive after it', async () => {
    const { client } = makeClient({ data: [PAST, FUTURE], error: null });
    const result = await PublicEventsService.listPublic(client);

    expect(result.map((e) => e.isPast)).toEqual([false, true]);
  });

  it('leads "Coming up" with what is running now, not with what began weeks ago', async () => {
    // An event that started three weeks ago and ends next year is the most
    // immediate thing on the page; sorted by its start date it would sit above
    // everything and read like a stale listing.
    const running = {
      ...FUTURE,
      id: 'running',
      name: 'Certificate courses',
      start_date: '2000-01-01T00:00:00+00:00',
      end_date: '2099-12-31T00:00:00+00:00',
      start_time: null,
      end_time: null,
    };
    const soon = { ...FUTURE, id: 'soon', name: 'Next month' };
    const { client } = makeClient({ data: [soon, running], error: null });
    const result = await PublicEventsService.listPublic(client);

    expect(result.map((e) => e.id)).toEqual(['running', 'soon']);
    expect(result[0].isOnNow).toBe(true);
    expect(result[1].isOnNow).toBe(false);
  });

  it('withholds the description from the archive and keeps it on what is coming', async () => {
    const { client } = makeClient({ data: [FUTURE, PAST], error: null });
    const [upcoming, archived] = await PublicEventsService.listPublic(client);

    expect(upcoming.summary).toBe(FUTURE.description);
    expect(archived.summary).toBeNull();
  });

  it('renders a single day with its times, and a run of days without them', async () => {
    const { client } = makeClient({
      data: [
        { ...FUTURE, id: 'a', end_date: '2099-03-04T00:00:00+00:00' },
        { ...FUTURE, id: 'b', end_date: '2099-03-09T00:00:00+00:00' },
      ],
      error: null,
    });
    const result = await PublicEventsService.listPublic(client);

    expect(result[0].whenLabel).toBe('4 March 2099, 9:30 am – 3:30 pm');
    expect(result[1].whenLabel).toBe('4 March – 9 March 2099');
  });

  it('does not call an undated event past — being unable to date it is not evidence it is over', async () => {
    const { client } = makeClient({
      data: [{ ...FUTURE, start_date: null, end_date: null, event_date: null }],
      error: null,
    });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.isPast).toBe(false);
    expect(event.isOnNow).toBe(false);
    expect(event.whenLabel).toBeNull();
  });

  it('prefers venue over venue_text and reports neither as null', async () => {
    const { client } = makeClient({
      data: [
        { ...FUTURE, id: 'a', venue: 'Convention Centre', venue_text: 'ignored' },
        { ...FUTURE, id: 'b', venue: null, venue_text: 'JKKN Sports Ground' },
        { ...FUTURE, id: 'c', venue: null, venue_text: '   ' },
      ],
      error: null,
    });
    const result = await PublicEventsService.listPublic(client);

    expect(result.map((e) => e.whereLabel)).toEqual([
      'Convention Centre',
      'JKKN Sports Ground',
      null,
    ]);
  });

  it('drops an unparseable time rather than guessing at one', async () => {
    const { client } = makeClient({
      data: [{ ...FUTURE, start_time: 'sometime', end_time: null }],
      error: null,
    });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.whenLabel).toBe('4 March 2099');
  });
});
