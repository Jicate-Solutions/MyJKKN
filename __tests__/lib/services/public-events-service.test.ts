// __tests__/lib/services/public-events-service.test.ts
//
// Guards the two rules that keep this listing honest:
//   1. It reads NOTHING an anonymous visitor could not already read — the same
//      table, the same flag, a named column list, and never select('*').
//   2. It never invites a registration that the registration page will refuse.
//
// These assert the TypeScript gatekeeper's own behaviour against a recording
// stub. They do not re-implement the RLS policy, and they are not evidence about
// it — `events_public_read` lives in supabase/setup/03_policies.sql and this PR
// does not touch it.
//
// Sibling: __tests__/lib/services/public-programme-service.test.ts.
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
  it('offers the general registration page for an ordinary event', async () => {
    const { client } = makeClient({ data: [FUTURE], error: null });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.registerHref).toBe(`/p/event/${FUTURE.id}/register`);
    expect(event.registerNote).toBeNull();
  });

  it('withholds the link once registration_close_date has passed, and says so', async () => {
    const { client } = makeClient({
      data: [{ ...FUTURE, registration_close_date: '2000-01-01' }],
      error: null,
    });
    const [event] = await PublicEventsService.listPublic(client);

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
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toMatch(/^Registration opens on .*February 2099\.$/);
  });

  it('sends a sports tournament to its own public door, not the general one', async () => {
    // /p/event/[id]/register answers a tournament with "Wrong registration
    // link", so linking there from a listing is a known dead end.
    const { client } = makeClient({
      data: [{ ...FUTURE, event_type: 'sports_tournament' }],
      error: null,
    });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.registerHref).toBe(`/p/tournament/${FUTURE.id}/register`);
  });

  it('offers a marathon no link at all, because no public one exists', async () => {
    const { client } = makeClient({ data: [{ ...FUTURE, event_type: 'marathon' }], error: null });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toContain('organisers');
  });

  it('offers a past event nothing, and needs no excuse for it', async () => {
    const { client } = makeClient({ data: [PAST], error: null });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.isPast).toBe(true);
    expect(event.registerHref).toBeNull();
    expect(event.registerNote).toBeNull();
  });
});

describe('PublicEventsService.listPublic — what a reader is shown', () => {
  it('puts what is still to come first, and the archive after it', async () => {
    const { client } = makeClient({ data: [PAST, FUTURE], error: null });
    const result = await PublicEventsService.listPublic(client);

    expect(result.map((e) => e.isPast)).toEqual([false, true]);
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

  it('falls back to event_date when neither range column is set', async () => {
    // One production row — a marathon — carries only event_date.
    const { client } = makeClient({
      data: [{ ...FUTURE, start_date: null, end_date: null, event_date: '2099-04-12', start_time: null }],
      error: null,
    });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.whenLabel).toBe('12 April 2099');
  });

  it('does not call an undated event past — being unable to date it is not evidence it is over', async () => {
    const { client } = makeClient({
      data: [{ ...FUTURE, start_date: null, end_date: null, event_date: null }],
      error: null,
    });
    const [event] = await PublicEventsService.listPublic(client);

    expect(event.isPast).toBe(false);
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
