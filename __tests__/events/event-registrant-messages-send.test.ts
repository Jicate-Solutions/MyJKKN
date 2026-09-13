// __tests__/events/event-registrant-messages-send.test.ts
//
// The send path itself, against a fake Supabase client. No network, no
// database, and no notification ever leaves the process — `fanoutNotification`
// is replaced by a spy, so "did this deliver?" is a question these tests can
// answer exactly.
//
// Three things are worth this much machinery:
//
//   1. A DOUBLE SUBMIT MUST NOT DELIVER TWICE. This feature sends real messages
//      to real learners; a duplicate blast is its worst failure, and it is
//      unrecallable. The UNIQUE (event_id, client_token) claim is asserted here
//      by counting fanout calls, not by reading the constraint.
//   2. A DELIVERED MESSAGE MUST NOT BE LOGGED AS "Delivered to 0". That reading
//      tells the organiser the send failed, and their next move is to send it
//      again — which is how a guard against duplicates becomes their cause.
//   3. THE AUDIENCE READ MUST BE PAGED. PostgREST truncates at db-max-rows and
//      returns the short page with no error, so an unpaged read quietly
//      understates the one number this whole feature exists to make honest.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fanout = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: fanout,
}));

import {
  AUDIENCE_PAGE_SIZE,
  fanoutKey,
  getAudience,
  sendRegistrantMessage,
} from '@/lib/services/events/organiser-message-service';

const TOKEN = '3f6b4c2e-9d51-4b7a-8c11-2f0a9e77d1b2';
const EVENT = 'event-1';

interface Op {
  table: string;
  op: 'select' | 'insert' | 'update';
  payload: any;
  filters: Record<string, any>;
  range: [number, number] | null;
}

/** A Supabase query builder just real enough for this service's calls. */
function makeClient(handle: (op: Op) => { data: any; error: any }) {
  const ops: Op[] = [];
  const client: any = {
    from(table: string) {
      const state: Op = { table, op: 'select', payload: null, filters: {}, range: null };
      const settle = () => {
        ops.push(state);
        return Promise.resolve(handle(state));
      };
      const builder: any = {
        select: () => builder,
        insert: (p: any) => ((state.op = 'insert'), (state.payload = p), builder),
        update: (p: any) => ((state.op = 'update'), (state.payload = p), builder),
        eq: (c: string, v: any) => ((state.filters[c] = v), builder),
        in: (c: string, v: any) => ((state.filters[c] = v), builder),
        order: () => builder,
        limit: () => builder,
        range: (a: number, b: number) => ((state.range = [a, b]), builder),
        maybeSingle: () => settle(),
        then: (res: any, rej: any) => settle().then(res, rej),
      };
      return builder;
    },
  };
  return { client, ops };
}

const ok = (data: any) => ({ data, error: null });
const ledgerRow = (over: Partial<Record<string, any>> = {}) => ({
  id: 'msg-1',
  subject: 'Venue changed',
  body: 'We have moved to the main auditorium.',
  audience_total: 3,
  recipient_count: 2,
  unreachable_count: 1,
  delivered_count: 0,
  notification_id: null,
  sent_by: 'actor-1',
  sent_at: '2026-09-13T10:00:00.000Z',
  ...over,
});

/** Two reachable registrations and one that matches no account. */
const REGISTRATIONS = [
  { profile_id: 'p1', learner_id: null, status: 'registered' },
  { profile_id: null, learner_id: 'L2', status: 'confirmed' },
  { profile_id: null, learner_id: null, status: 'registered' },
];

const send = (client: any) =>
  sendRegistrantMessage(client, {
    eventId: EVENT,
    eventName: 'Sports Meet 2026',
    actorId: 'actor-1',
    input: { subject: 'Venue changed', body: 'We have moved to the main auditorium.', clientToken: TOKEN },
  });

beforeEach(() => fanout.mockReset());

describe('sendRegistrantMessage — the duplicate-blast guard', () => {
  it('sends once, and records what the fanout actually reached', async () => {
    fanout.mockResolvedValue({ notified: 2, notificationId: 'notif-1' });

    const { client, ops } = makeClient((op) => {
      if (op.table === 'events_registrations') {
        return ok(op.range && op.range[0] === 0 ? REGISTRATIONS : []);
      }
      if (op.table === 'profiles') return ok([{ id: 'p2', learner_id: 'L2', full_name: 'A Sender' }]);
      if (op.op === 'insert') return ok(ledgerRow());
      if (op.op === 'update') return ok(ledgerRow({ ...op.payload }));
      return ok(null);
    });

    const result = await send(client);

    expect(fanout).toHaveBeenCalledTimes(1);
    // Both reachable people — including the learner filed by learner_id.
    expect(fanout.mock.calls[0][1].userIds.sort()).toEqual(['p1', 'p2']);
    // The fanout key is derived from the ledger row, so a retry cannot deliver.
    expect(fanout.mock.calls[0][1].idempotencyKey).toBe(fanoutKey('msg-1'));
    expect(result.deduplicated).toBe(false);
    expect(result.message.delivered_count).toBe(2);

    // The registration that matched no account is recorded, not silently lost.
    const claim = ops.find((o) => o.op === 'insert');
    expect(claim?.payload.unreachable_count).toBe(1);
    expect(claim?.payload.recipient_count).toBe(2);
    expect(claim?.payload.audience_total).toBe(3);
  });

  it('DELIVERS NOTHING when the same token is submitted again after a successful send', async () => {
    fanout.mockResolvedValue({ notified: 2, notificationId: 'notif-1' });

    const { client } = makeClient((op) => {
      if (op.table === 'events_registrations') {
        return ok(op.range && op.range[0] === 0 ? REGISTRATIONS : []);
      }
      if (op.table === 'profiles') return ok([{ id: 'p2', learner_id: 'L2', full_name: 'A Sender' }]);
      // The constraint fires: this compose has been submitted before.
      if (op.op === 'insert') return { data: null, error: { code: '23505' } };
      // …and the first row is read back, already delivered.
      return ok(ledgerRow({ delivered_count: 2, notification_id: 'notif-1' }));
    });

    const result = await send(client);

    // The whole point: not one notification was produced by the second submit.
    expect(fanout).not.toHaveBeenCalled();
    expect(result.deduplicated).toBe(true);
    // …and the organiser is shown the first send's real reach, not zero.
    expect(result.message.delivered_count).toBe(2);
  });

  it('retries a send whose fanout never completed, under the SAME key', async () => {
    // A genuinely failed attempt must be retryable, or the organiser is stuck
    // with a message that reached nobody and a token that refuses to resend it.
    fanout.mockResolvedValue({ notified: 2, notificationId: 'notif-1' });

    const { client } = makeClient((op) => {
      if (op.table === 'events_registrations') {
        return ok(op.range && op.range[0] === 0 ? REGISTRATIONS : []);
      }
      if (op.table === 'profiles') return ok([{ id: 'p2', learner_id: 'L2', full_name: 'A Sender' }]);
      if (op.op === 'insert') return { data: null, error: { code: '23505' } };
      if (op.op === 'update') return ok(ledgerRow({ ...op.payload }));
      return ok(ledgerRow({ delivered_count: 0, notification_id: null }));
    });

    const result = await send(client);

    expect(fanout).toHaveBeenCalledTimes(1);
    // Same ledger row ⇒ same idempotency key. If the first attempt DID in fact
    // deliver, the fanout skips instead of sending a second time.
    expect(fanout.mock.calls[0][1].idempotencyKey).toBe(fanoutKey('msg-1'));
    expect(result.message.delivered_count).toBe(2);
  });

  it('does not log a delivered message as "Delivered to 0" when the fanout skips as idempotent', async () => {
    // The failure that walks an organiser into the duplicate send: the message
    // is in all 2 recipients' bells, and the log says it reached nobody.
    fanout.mockResolvedValue({ notified: 0, notificationId: 'notif-1', skipped: 'idempotent' });

    const { client, ops } = makeClient((op) => {
      if (op.table === 'events_registrations') {
        return ok(op.range && op.range[0] === 0 ? REGISTRATIONS : []);
      }
      if (op.table === 'profiles') return ok([{ id: 'p2', learner_id: 'L2', full_name: 'A Sender' }]);
      if (op.op === 'insert') return ok(ledgerRow());
      if (op.op === 'update') return ok(ledgerRow({ ...op.payload }));
      return ok(null);
    });

    const result = await send(client);

    const update = ops.find((o) => o.op === 'update');
    expect(update?.payload.delivered_count).toBe(2);
    expect(update?.payload.notification_id).toBe('notif-1');
    expect(result.message.delivered_count).toBe(2);
  });

  it('names the sender, because the board promises to show who sent it', async () => {
    fanout.mockResolvedValue({ notified: 2, notificationId: 'notif-1' });

    const { client } = makeClient((op) => {
      if (op.table === 'events_registrations') {
        return ok(op.range && op.range[0] === 0 ? REGISTRATIONS : []);
      }
      if (op.table === 'profiles') {
        // The learner lookup and the sender lookup hit the same table.
        if (op.filters['learner_id']) return ok([{ id: 'p2', learner_id: 'L2' }]);
        return ok([{ id: 'actor-1', full_name: 'Priya R' }]);
      }
      if (op.op === 'insert') return ok(ledgerRow());
      if (op.op === 'update') return ok(ledgerRow({ ...op.payload }));
      return ok(null);
    });

    const result = await send(client);
    expect(result.message.sent_by_name).toBe('Priya R');
  });
});

describe('getAudience — paged, not truncated', () => {
  const page = (n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => ({
      profile_id: `p${offset + i}`,
      learner_id: null,
      status: 'registered',
    }));

  it('reads past the PostgREST row cap instead of stopping at it', async () => {
    // A full page means "there may be more". An unpaged read would have
    // reported 1000 for this 1,200-person event and said nothing about it.
    const { client } = makeClient((op) => {
      if (op.table !== 'events_registrations') return ok([]);
      const from = op.range ? op.range[0] : 0;
      if (from === 0) return ok(page(AUDIENCE_PAGE_SIZE));
      if (from === AUDIENCE_PAGE_SIZE) return ok(page(200, AUDIENCE_PAGE_SIZE));
      return ok([]);
    });

    const audience = await getAudience(client, EVENT);
    expect(audience.audienceTotal).toBe(AUDIENCE_PAGE_SIZE + 200);
    expect(audience.recipientIds).toHaveLength(AUDIENCE_PAGE_SIZE + 200);
    expect(audience.truncated).toBe(false);
  });

  it('stops after one read when the first page is short', async () => {
    const { client, ops } = makeClient((op) =>
      op.table === 'events_registrations' ? ok(page(7)) : ok([])
    );
    const audience = await getAudience(client, EVENT);
    expect(audience.audienceTotal).toBe(7);
    expect(ops.filter((o) => o.table === 'events_registrations')).toHaveLength(1);
  });

  it('asks the profiles table only about learner ids it could not already reach', async () => {
    const { client, ops } = makeClient((op) => {
      if (op.table === 'events_registrations') {
        return ok(op.range && op.range[0] === 0 ? REGISTRATIONS : []);
      }
      if (op.table === 'profiles') return ok([{ id: 'p2', learner_id: 'L2' }]);
      return ok([]);
    });
    await getAudience(client, EVENT);
    const lookup = ops.find((o) => o.table === 'profiles');
    expect(lookup?.filters['learner_id']).toEqual(['L2']);
  });

  it('skips the lookup entirely when every registration already names a profile', async () => {
    const { client, ops } = makeClient((op) =>
      op.table === 'events_registrations'
        ? ok(op.range && op.range[0] === 0 ? page(3) : [])
        : ok([])
    );
    await getAudience(client, EVENT);
    expect(ops.filter((o) => o.table === 'profiles')).toHaveLength(0);
  });
});
