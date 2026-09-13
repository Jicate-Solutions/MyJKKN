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

/**
 * Minimal recording stand-in for the PostgREST builder chain.
 *
 * The service issues TWO bounded reads — dated rows (`start_date` not null) and
 * undated ones (`start_date` is null) — so each `from()` hands back its own
 * builder, and which result it resolves to is decided by the filter the service
 * actually applied. `dated` is the default because most fixtures carry dates.
 */
function makeClient(dated: QueryResult, undated: QueryResult = { data: [], error: null }) {
  const calls = {
    from: [] as string[],
    select: [] as string[],
    eq: [] as Array<[string, unknown]>,
    neq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown]>,
    is: [] as Array<[string, unknown]>,
    not: [] as Array<[string, string, unknown]>,
    order: [] as Array<[string, { ascending?: boolean } | undefined]>,
    limit: [] as number[],
  };

  const client = {
    from(table: string) {
      calls.from.push(table);
      let wantsUndated = false;
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
        is(column: string, value: unknown) {
          calls.is.push([column, value]);
          if (column === 'start_date' && value === null) wantsUndated = true;
          return builder;
        },
        not(column: string, operator: string, value: unknown) {
          calls.not.push([column, operator, value]);
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          calls.order.push([column, options]);
          return builder;
        },
        limit(count: number) {
          calls.limit.push(count);
          return builder;
        },
        then(onFulfilled: (value: QueryResult) => unknown) {
          return Promise.resolve(wantsUndated ? undated : dated).then(onFulfilled);
        },
      };
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
  const calls = {
    from: [] as string[],
    select: [] as string[],
    in: [] as Array<[string, unknown]>,
    eq: [] as Array<[string, unknown]>,
  };
  const client = {
    from(table: string) {
      calls.from.push(table);
      const result = tables[table] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {
        select(columns: string) {
          calls.select.push(columns);
          return builder;
        },
        eq(column: string, value: unknown) {
          calls.eq.push([column, value]);
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
    expect(visibilityFilters.length).toBeGreaterThan(0);
    for (const filter of visibilityFilters) expect(filter).toEqual(['visibility', 'public']);
  });
});

describe('PublicEventsService.listPublic — the public gate', () => {
  it('reads only the events table, and only the rows the public policy exposes', async () => {
    const { client, calls } = makeClient({ data: [FUTURE], error: null });
    await PublicEventsService.listPublic(client);

    expect(new Set(calls.from)).toEqual(new Set(['events']));
    expect(calls.eq).toContainEqual(['is_public', true]);
    expect(calls.neq).toContainEqual(['status', 'draft']);
    expect(calls.neq).toContainEqual(['status', 'cancelled']);
  });

  it('caps the read — a public route must not become unbounded', async () => {
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicEventsService.listPublic(client);

    // One cap per read, and the reads are bounded in number (dated + undated).
    expect(calls.limit.length).toBeGreaterThan(0);
    expect(calls.limit.length).toBeLessThanOrEqual(2);
    for (const cap of calls.limit) expect(cap).toBeGreaterThan(0);
  });

  it('never selects every column — a column added to events later cannot leak by omission', async () => {
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicEventsService.listPublic(client);

    expect(calls.select.length).toBeGreaterThan(0);
    for (const selected of calls.select) {
      expect(selected).not.toContain('*');
      for (const column of ['id', 'name', 'event_type', 'registration_close_date']) {
        expect(selected).toContain(column);
      }
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
      for (const selected of calls.select) expect(selected).not.toContain(forbidden);
    }
  });

  it('returns an empty listing when the read fails (fail closed)', async () => {
    const { client } = makeClient({ data: null, error: { message: 'boom' } });
    expect(await PublicEventsService.listPublic(client)).toEqual([]);
  });

  it('reads NEWEST first, so the cap can only ever drop the oldest archive rows', async () => {
    // Ascending + LIMIT would spend the whole budget on the oldest archive the
    // moment the public list outgrows the cap, truncating every upcoming event
    // off the end — "Coming up" empty, archive ancient, and nothing errors.
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicEventsService.listPublic(client);

    for (const [, options] of calls.order) {
      expect(options?.ascending).toBe(false);
    }
    // And the undated rows get a read of their own, so an event carrying only
    // event_date is not the first casualty of the cap.
    expect(calls.is).toContainEqual(['start_date', null]);
    expect(calls.not).toContainEqual(['start_date', 'is', null]);
  });

  it('lists the undated rows the cap would otherwise drop first', async () => {
    // A row carrying only event_date has a NULL start_date, which sorts below
    // the oldest archive row under a single descending order — so it, and not
    // the ancient archive, is the first casualty of LIMIT. It gets its own
    // bounded read.
    const undated = {
      ...FUTURE,
      id: 'undated',
      name: 'Marathon with only an event_date',
      start_date: null,
      end_date: null,
      event_date: '2099-04-12',
      start_time: null,
    };
    const { client } = makeClient({ data: [FUTURE], error: null }, { data: [undated], error: null });
    const result = await PublicEventsService.listPublic(client);

    expect(result.map((e) => e.id).sort()).toEqual([FUTURE.id, 'undated'].sort());
  });

  it('says a failed read FAILED, so an outage cannot pass for "nothing is on"', async () => {
    const failed = await PublicEventsService.listPublicWithStatus(
      makeClient({ data: null, error: { message: 'permission denied' } }).client,
    );
    const empty = await PublicEventsService.listPublicWithStatus(
      makeClient({ data: [], error: null }).client,
    );

    expect(failed).toEqual({ events: [], readFailed: true, doorCheckFailed: false });
    expect(empty).toEqual({ events: [], readFailed: false, doorCheckFailed: false });
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
    // "not open", not "not open yet" — a form switched off after it ran is
    // shut, not pending, and this read cannot tell the two apart.
    expect(event.registerNote).toBe('Registration is not open for this one.');
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

  it('reports a door it could not check, so the caller can refuse to cache the silence', async () => {
    // A card missing its button because a read timed out looks exactly like a
    // card with no registration. The page uses this flag to keep that render
    // out of the ISR cache rather than serving it for five minutes.
    const { client } = makeClient({ data: [FUTURE], error: null });
    const { admin } = makeAdmin({
      event_registration_forms: { data: null, error: { message: 'timeout' } },
    });

    const failed = await PublicEventsService.listPublicWithStatus(client, admin);
    const fine = await PublicEventsService.listPublicWithStatus(
      makeClient({ data: [FUTURE], error: null }).client,
      makeAdmin({ event_registration_forms: openFormFor(FUTURE.id) }).admin,
    );

    expect(failed.doorCheckFailed).toBe(true);
    expect(fine.doorCheckFailed).toBe(false);
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

  it('does not let one door table answer for the other', async () => {
    // A failure reading tournament_divisions must not strip the button from an
    // unrelated general event: one table's outage, one table's silence.
    const tournament = { ...FUTURE, id: 'tournament', event_type: 'sports_tournament' };
    const general = { ...FUTURE, id: 'general' };
    const { client } = makeClient({ data: [general, tournament], error: null });
    const { admin } = makeAdmin({
      event_registration_forms: openFormFor('general'),
      tournament_divisions: { data: null, error: { message: '42703 column does not exist' } },
    });
    const result = await PublicEventsService.listPublic(client, admin);
    const byId = Object.fromEntries(result.map((e) => [e.id, e]));

    expect(byId.general.registerHref).toBe('/p/event/general/register');
    expect(byId.tournament.registerHref).toBeNull();
    expect(byId.tournament.registerNote).toBeNull(); // unknown, not "closed"
  });

  it('settles whether a public door exists BEFORE reading the registration window', async () => {
    // Otherwise a marathon or a School of Influence event with a future open
    // date advertises "Registration opens on <date>" for a door this listing
    // will never offer — and for SoI, advertises it to the public.
    const { client } = makeClient({
      data: [
        { ...FUTURE, id: 'soi', event_type: 'school_of_influence', registration_open_date: '2099-02-01' },
        { ...FUTURE, id: 'marathon', event_type: 'marathon', registration_open_date: '2099-02-01' },
      ],
      error: null,
    });
    const { admin } = makeAdmin({ event_registration_forms: openFormFor(FUTURE.id) });
    const result = await PublicEventsService.listPublic(client, admin);

    for (const event of result) {
      expect(event.registerHref).toBeNull();
      expect(event.registerNote).not.toMatch(/Registration opens on/);
    }
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
    // The division must be an ACTIVE one — the tournament page requires it, and
    // a stub that ignored its filter arguments could not have caught a drift.
    expect(withDivisions.calls.eq).toContainEqual(['is_active', true]);
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

  it('ranks a running event above one that merely starts later today', async () => {
    const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const running = {
      ...FUTURE,
      id: 'running',
      start_date: '2000-01-01T00:00:00+00:00',
      end_date: '2099-12-31T00:00:00+00:00',
      start_time: null,
      end_time: null,
    };
    const startsToday = {
      ...FUTURE,
      id: 'starts-today',
      start_date: `${today}T00:00:00+05:30`,
      end_date: `${today}T00:00:00+05:30`,
      start_time: null,
      end_time: null,
    };
    // Both share today as their primary key; the tie-break decides, and ranking
    // the running one by its far-off end day would invert them.
    const { client } = makeClient({ data: [startsToday, running], error: null });
    const result = await PublicEventsService.listPublic(client);

    expect(result.map((e) => e.id)).toEqual(['running', 'starts-today']);
  });

  it('orders "Recently at JKKN" by when things ENDED', async () => {
    const endedYesterday = {
      ...FUTURE,
      id: 'long-run',
      name: 'A long run that ended recently',
      start_date: '2019-11-01T00:00:00+00:00',
      end_date: '2020-06-30T00:00:00+00:00',
      start_time: null,
      end_time: null,
    };
    const oneDayLater = {
      ...FUTURE,
      id: 'single-day',
      name: 'A single day that started later but ended sooner',
      start_date: '2020-01-15T00:00:00+00:00',
      end_date: '2020-01-15T00:00:00+00:00',
      start_time: null,
      end_time: null,
    };
    const { client } = makeClient({ data: [oneDayLater, endedYesterday], error: null });
    const result = await PublicEventsService.listPublic(client);

    // Sorted by start day, the single day would lead the archive despite having
    // finished five months earlier.
    expect(result.map((e) => e.id)).toEqual(['long-run', 'single-day']);
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

  it('reads a row carrying only an end date as a single day on that date', async () => {
    const { client } = makeClient({
      data: [
        {
          ...FUTURE,
          start_date: null,
          event_date: null,
          end_date: '2099-05-06T00:00:00+00:00',
          start_time: null,
          end_time: null,
        },
      ],
      error: null,
    });
    const [event] = await PublicEventsService.listPublic(client);

    // Not "the start is unknown, but here is the end date under When".
    expect(event.whenLabel).toBe('6 May 2099');
    expect(event.isPast).toBe(false);
  });

  it('badges "Happening now" only for a run of days that began before today', async () => {
    // Same arithmetic the service uses: India is a fixed +05:30, so shifting
    // the instant and taking the UTC date is the Indian calendar day. Not
    // toLocaleDateString('en-CA') — the trick the service header rejects.
    const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const startsLaterToday = {
      ...FUTURE,
      id: 'today',
      start_date: `${today}T00:00:00+05:30`,
      end_date: `${today}T00:00:00+05:30`,
      start_time: '18:00:00',
      end_time: null,
    };
    const startedBefore = {
      ...FUTURE,
      id: 'running',
      start_date: '2000-01-01T00:00:00+00:00',
      end_date: '2099-12-31T00:00:00+00:00',
      start_time: null,
      end_time: null,
    };
    const { client } = makeClient({ data: [startsLaterToday, startedBefore], error: null });
    const result = await PublicEventsService.listPublic(client);
    const byId = Object.fromEntries(result.map((e) => [e.id, e]));

    expect(byId.today.isOnNow).toBe(false);
    expect(byId.today.isPast).toBe(false);
    expect(byId.running.isOnNow).toBe(true);
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
