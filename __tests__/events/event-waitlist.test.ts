// __tests__/events/event-waitlist.test.ts
//
// The decisions the waiting-list service makes without a database, plus the
// exact SHAPE of the two statements that touch an offered or waiting row —
// because the database trigger (proven in event-waitlist-seat-holding.pg.test.ts)
// only accepts one shape for each, and a service that drifted from it would
// fail loudly in production rather than here.
//
//   1. WHAT NUMBER a queued person is shown — rank among those still waiting.
//   2. WHERE a held place appears — first, always.
//   3. WHETHER A MISSING TABLE IS AN ERROR — it is not.
//   4. THE CLAIM presents the code, names the registration, and filters on
//      'offered' plus the deadline. Nothing else ever writes claim_code.
//   5. THE CLEAN-UP after an ordinary registration targets WAITING rows only,
//      by account only. It cannot reach an offered row at all.
//   6. THE QUEUE refuses to store anybody without an account.
//
// Supabase is a recording fake; no network, no database.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: vi.fn(),
}));

import {
  claimOffer,
  closeWaitingRowsFor,
  isMissingObject,
  joinWaitlist,
  orderQueue,
  queuedMessage,
} from '@/lib/services/events/waitlist-service';

function row(
  overrides: Partial<Parameters<typeof orderQueue>[0][number]> & { queue_seq: number }
) {
  return {
    id: `w-${overrides.queue_seq}`,
    status: 'waiting',
    participant_name: `Person ${overrides.queue_seq}`,
    joined_at: '2026-09-14T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * A chainable fake of the PostgREST builder that records every call and
 * resolves with whatever `respond` returns for the table. Enough to assert
 * the shape of a statement without a database.
 */
function fakeSupabase(respond: (table: string, calls: Array<[string, unknown[]]>) => unknown) {
  const statements: Array<{ table: string; calls: Array<[string, unknown[]]> }> = [];
  const from = (table: string) => {
    const calls: Array<[string, unknown[]]> = [];
    statements.push({ table, calls });
    const builder: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            const result = respond(table, calls);
            return (resolve: (v: unknown) => void) => resolve(result);
          }
          return (...args: unknown[]) => {
            calls.push([prop, args]);
            return builder;
          };
        },
      }
    );
    return builder;
  };
  return { client: { from } as any, statements };
}

function call(calls: Array<[string, unknown[]]>, name: string) {
  return calls.filter(([n]) => n === name).map(([, args]) => args);
}

describe('orderQueue — the position a person is shown', () => {
  it('ranks by order in the queue, not by the stored join number', () => {
    const entries = orderQueue([row({ queue_seq: 3 }), row({ queue_seq: 7 }), row({ queue_seq: 9 })]);
    expect(entries.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(entries.map((e) => e.queue_seq)).toEqual([3, 7, 9]);
  });

  it('ranks correctly when the rows arrive out of order', () => {
    const entries = orderQueue([row({ queue_seq: 9 }), row({ queue_seq: 3 }), row({ queue_seq: 7 })]);
    expect(entries.map((e) => e.position)).toEqual([1, 2, 3]);
  });

  it('gives a held place no position and does not push the queue down to "number 2"', () => {
    const entries = orderQueue([
      row({ queue_seq: 1, status: 'offered', offered_at: '2026-09-14T09:00:00.000Z' }),
      row({ queue_seq: 2 }),
      row({ queue_seq: 3 }),
    ]);
    expect(entries[0].status).toBe('offered');
    expect(entries[0].position).toBeNull();
    expect(entries.filter((e) => e.status === 'waiting').map((e) => e.position)).toEqual([1, 2]);
  });
});

describe('orderQueue — a valid total order', () => {
  const BY_RANK = ['offered', 'waiting', 'registered', 'expired', 'something_new'];

  it('sorts every pair by rank whichever queue_seq order they arrive in', () => {
    for (let i = 0; i < BY_RANK.length; i++) {
      for (let j = i + 1; j < BY_RANK.length; j++) {
        const higher = BY_RANK[i];
        const lower = BY_RANK[j];
        expect(
          orderQueue([row({ queue_seq: 1, status: higher }), row({ queue_seq: 2, status: lower })]).map(
            (e) => e.status
          )
        ).toEqual([higher, lower]);
        // queue_seq contradicts rank: only the status sort can be right here.
        expect(
          orderQueue([row({ queue_seq: 1, status: lower }), row({ queue_seq: 2, status: higher })]).map(
            (e) => e.status
          )
        ).toEqual([higher, lower]);
      }
    }
  });

  it('carries the hold deadline through to the entry', () => {
    const [e] = orderQueue([
      row({ queue_seq: 1, status: 'offered', offer_expires_at: '2026-09-16T09:00:00.000Z' }),
    ]);
    expect(e.offer_expires_at).toBe('2026-09-16T09:00:00.000Z');
  });
});

describe('queuedMessage — what the person is told', () => {
  it('always says "waiting list"', () => {
    for (const position of [null, 1, 2, 17]) {
      expect(queuedMessage(position).toLowerCase()).toContain('waiting list');
    }
  });
  it('names the position, says "first" rather than "number 1", never "number 0"', () => {
    expect(queuedMessage(7)).toContain('number 7');
    expect(queuedMessage(1)).toContain('first');
    expect(queuedMessage(1)).not.toContain('number 1');
    expect(queuedMessage(0)).not.toContain('number');
    expect(queuedMessage(null)).not.toContain('number');
  });
  it('says "already" and "does not move you up" to a resubmission', () => {
    for (const position of [null, 1, 4]) {
      const m = queuedMessage(position, true).toLowerCase();
      expect(m).toContain('already');
      expect(m).toContain('does not move you up');
    }
  });
});

describe('isMissingObject — the deploy-before-apply window', () => {
  it('treats a missing relation or function as "no waiting list yet"', () => {
    expect(isMissingObject({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(isMissingObject({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
    expect(isMissingObject({ code: '42883' })).toBe(true);
    expect(isMissingObject({ code: 'PGRST202' })).toBe(true);
    expect(
      isMissingObject({ message: "Could not find the table 'public.x' in the schema cache" })
    ).toBe(true);
  });
  it('does NOT swallow a real failure or schema drift', () => {
    expect(isMissingObject({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingObject({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isMissingObject({ code: '42703', message: 'column x does not exist' })).toBe(false);
    expect(
      isMissingObject({ code: 'PGRST204', message: "Could not find the 'x' column of 'y' in the schema cache" })
    ).toBe(false);
    expect(isMissingObject(null)).toBe(false);
  });
});

describe('claimOffer — the one statement that leaves offered', () => {
  it('presents the code, names the registration, and filters on offered + deadline', async () => {
    const { client, statements } = fakeSupabase(() => ({ data: [{ id: 'w1' }], error: null }));
    const before = Date.now();
    const outcome = await claimOffer(client, 'w1', 'ABC234', 'reg-9');
    expect(outcome).toBe('claimed');

    const [stmt] = statements;
    expect(stmt.table).toBe('event_registration_waitlist');
    expect(call(stmt.calls, 'update')[0][0]).toEqual({
      status: 'registered',
      registration_id: 'reg-9',
      claim_code_presented: 'ABC234',
    });
    expect(call(stmt.calls, 'eq')).toEqual([
      ['id', 'w1'],
      ['status', 'offered'],
    ]);
    const [[column, iso]] = call(stmt.calls, 'gt') as [[string, string]];
    expect(column).toBe('offer_expires_at');
    expect(Date.parse(iso)).toBeGreaterThanOrEqual(before - 1000);
  });

  it('never writes claim_code itself — consuming it is the database\'s job', async () => {
    const { client, statements } = fakeSupabase(() => ({ data: [{ id: 'w1' }], error: null }));
    await claimOffer(client, 'w1', 'ABC234', 'reg-9');
    const payload = call(statements[0].calls, 'update')[0][0] as Record<string, unknown>;
    expect('claim_code' in payload).toBe(false);
  });

  it('reports a zero-row update as lost and a failed write as error, never as claimed', async () => {
    const lost = fakeSupabase(() => ({ data: [], error: null }));
    expect(await claimOffer(lost.client, 'w1', 'ABC234', 'reg-9')).toBe('lost');
    const failed = fakeSupabase(() => ({ data: null, error: { code: '42501', message: 'refused' } }));
    expect(await claimOffer(failed.client, 'w1', 'ABC234', 'reg-9')).toBe('error');
  });
});

describe('closeWaitingRowsFor — the clean-up that cannot reach a held place', () => {
  it('looks up by account and WAITING status only, then closes that row by id with the registration', async () => {
    const { client, statements } = fakeSupabase((_table, calls) =>
      call(calls, 'select').length
        ? { data: [{ id: 'w-waiting', queue_seq: 4, status: 'waiting', form_id: 'f1' }], error: null }
        : { data: null, error: null }
    );
    await closeWaitingRowsFor(client, 'ev1', 'profile-1', 'f1', 'reg-1');

    const [lookup, close] = statements;
    expect(call(lookup.calls, 'eq')).toEqual(
      expect.arrayContaining([
        ['event_id', 'ev1'],
        ['profile_id', 'profile-1'],
      ])
    );
    expect(call(lookup.calls, 'in')).toEqual([['status', ['waiting']]]);
    // No name, phone or email predicate anywhere — identity only.
    const columns = call(lookup.calls, 'eq').map(([c]) => c);
    expect(columns).not.toContain('participant_name');
    expect(columns).not.toContain('participant_phone');
    expect(columns).not.toContain('participant_email');

    expect(call(close.calls, 'update')[0][0]).toEqual({ status: 'registered', registration_id: 'reg-1' });
    expect(call(close.calls, 'eq')).toEqual([
      ['id', 'w-waiting'],
      ['status', 'waiting'],
    ]);
    const payload = call(close.calls, 'update')[0][0] as Record<string, unknown>;
    expect('claim_code' in payload).toBe(false);
    expect('claim_code_presented' in payload).toBe(false);
  });

  it('writes nothing when the person holds no waiting row', async () => {
    const { client, statements } = fakeSupabase(() => ({ data: [], error: null }));
    await closeWaitingRowsFor(client, 'ev1', 'profile-1', 'f1', 'reg-1');
    expect(statements).toHaveLength(1);
    expect(call(statements[0].calls, 'update')).toHaveLength(0);
  });
});

describe('joinWaitlist — signed-in people only', () => {
  it('refuses to store anybody without an account, before touching the database', async () => {
    const { client, statements } = fakeSupabase(() => ({ data: [], error: null }));
    const result = await joinWaitlist(client, {
      eventId: 'ev1',
      formId: 'f1',
      participantName: 'Guest',
      participantEmail: 'g@example.com',
      participantPhone: null,
      profileId: '' as unknown as string,
      learnerId: null,
      institutionId: null,
      customFields: null,
    });
    expect(result.outcome).toBe('error');
    expect(statements).toHaveLength(0);
  });

  it('falls back to not_available when the table is missing', async () => {
    const { client } = fakeSupabase((table) =>
      table === 'events_registrations'
        ? { data: [], error: null }
        : { data: null, error: { code: '42P01', message: 'relation "event_registration_waitlist" does not exist' } }
    );
    const result = await joinWaitlist(client, {
      eventId: 'ev1',
      formId: 'f1',
      participantName: 'Person',
      participantEmail: null,
      participantPhone: '9999999999',
      profileId: 'profile-1',
      learnerId: null,
      institutionId: null,
      customFields: null,
    });
    expect(result.outcome).toBe('not_available');
  });
});
