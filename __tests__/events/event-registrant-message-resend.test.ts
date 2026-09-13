// __tests__/events/event-registrant-message-resend.test.ts
//
// The DELIBERATE resend, and the two honesty rules it depends on.
//
// The ruling behind this file: "show what was sent, allow a deliberate resend."
// Before it, a second send of the same words was decided by state nobody can
// see — swallowed while the compose binding was held, delivered a second time
// after a page reload. Same keystrokes, opposite outcomes, and no way for an
// organiser whose send half-failed to retry on purpose.
//
// So four things are asserted here, and they pull against each other on
// purpose:
//
//   1. A repeat WITHOUT stated intent is detectable (contentMatchIn), so the
//      route can refuse it. That is what stops a re-typed announcement from
//      becoming a silent second blast.
//   2. A repeat WITH stated intent genuinely delivers — its own row, its own
//      fanout key. A guard that also blocked the deliberate case would leave
//      the organiser exactly where the ruling found them.
//   3. A double click on "Send again" still delivers ONCE. Weakening (1) must
//      not weaken the accident guard, so this counts fanout calls rather than
//      reading the constraint.
//   4. A send whose write-back fails is never reported as "delivered to 0".
//      That reading is what pushes an organiser into the duplicate blast every
//      other rule here exists to prevent.
//
// No network, no database, and no notification leaves the process:
// `fanoutNotification` is a spy.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fanout = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: fanout,
}));

import {
  contentMatchIn,
  deliveryState,
  fanoutKey,
  sendRegistrantMessage,
  validateMessageInput,
  type ContentMatchRow,
} from '@/lib/services/events/organiser-message-service';

const TOKEN_A = '3f6b4c2e-9d51-4b7a-8c11-2f0a9e77d1b2';
const TOKEN_B = '8c2d1a90-4e73-4f16-9b55-1d0c6a3e88f4';
const EVENT = 'event-1';
const SUBJECT = 'Venue changed';
const BODY = 'We have moved to the main auditorium.';

// ---------------------------------------------------------------------------
// 1. Detecting an unintended repeat
// ---------------------------------------------------------------------------

const match = (over: Partial<ContentMatchRow> = {}): ContentMatchRow => ({
  id: 'msg-1',
  subject: SUBJECT,
  body: BODY,
  client_token: TOKEN_A,
  sent_at: '2026-09-13T10:00:00.000Z',
  // Carried so the refusal can say what became of the match instead of
  // asserting a delivery. Delivered by default; the unconfirmed case is the
  // one the route's copy has to branch on.
  notification_id: 'notif-1',
  delivered_count: 2,
  ...over,
});

describe('contentMatchIn — is this the same announcement, sent again', () => {
  it('finds an earlier message with the same words under a different token', () => {
    const found = contentMatchIn([match()], SUBJECT, BODY, TOKEN_B);
    expect(found?.id).toBe('msg-1');
  });

  it('ignores whitespace around the text, because the organiser did not change the message', () => {
    const found = contentMatchIn([match()], `  ${SUBJECT}  `, `${BODY}\n`, TOKEN_B);
    expect(found?.id).toBe('msg-1');
  });

  it('does NOT treat this send\'s own row as a duplicate of itself', () => {
    // A row carrying the request's own token is this very send arriving twice —
    // a double click. Routing it here would tell an organiser who clicked twice
    // that they must confirm a resend they never asked for; it belongs to the
    // UNIQUE constraint and its "deduplicated" answer instead.
    expect(contentMatchIn([match({ client_token: TOKEN_A })], SUBJECT, BODY, TOKEN_A)).toBeNull();
  });

  it('does not match a message whose body differs', () => {
    expect(contentMatchIn([match({ body: 'Something else entirely.' })], SUBJECT, BODY, TOKEN_B))
      .toBeNull();
  });

  it('does not collide across the subject/body boundary', () => {
    // subject "ab" + body "c" must not read as subject "a" + body "bc".
    const rows = [match({ subject: 'ab', body: 'c' })];
    expect(contentMatchIn(rows, 'a', 'bc', TOKEN_B)).toBeNull();
  });

  it('returns the most recent match, which is the one the organiser is thinking about', () => {
    const rows = [
      match({ id: 'old', sent_at: '2026-09-01T10:00:00.000Z' }),
      match({ id: 'new', sent_at: '2026-09-12T10:00:00.000Z', client_token: TOKEN_B }),
    ];
    expect(contentMatchIn(rows, SUBJECT, BODY, 'ffffffff-ffff-4fff-8fff-ffffffffffff')?.id).toBe(
      'new'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The intent flag itself
// ---------------------------------------------------------------------------

describe('validateMessageInput — the stated intent to repeat', () => {
  const base = { subject: SUBJECT, body: BODY, clientToken: TOKEN_A };

  it('accepts a compose with no resend target', () => {
    const v = validateMessageInput(base);
    expect(v.ok).toBe(true);
    expect(v.value.resendOf).toBeNull();
  });

  it('carries a well-formed resend target through', () => {
    const v = validateMessageInput({ ...base, resendOf: TOKEN_B });
    expect(v.ok).toBe(true);
    expect(v.value.resendOf).toBe(TOKEN_B);
  });

  it('REFUSES a malformed resend target rather than dropping it', () => {
    // Dropping it would silently downgrade a deliberate resend into a first
    // send — which the duplicate guard then refuses with a sentence about a
    // message the organiser was not trying to write.
    const v = validateMessageInput({ ...base, resendOf: 'not-a-uuid' });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/could not be identified/i);
  });

  it('treats an explicit null as "this is a new message"', () => {
    const v = validateMessageInput({ ...base, resendOf: null });
    expect(v.ok).toBe(true);
    expect(v.value.resendOf).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. What the history is allowed to claim
// ---------------------------------------------------------------------------

describe('deliveryState — never claims a delivered message failed', () => {
  it('reports a send with recipients as delivered', () => {
    expect(deliveryState({ notification_id: 'n-1', delivered_count: 34 })).toBe('delivered');
  });

  it('reports a send with a notification but no counted recipients as delivered', () => {
    // The write-back can fail AFTER the fanout completed. The notification row
    // exists, so the people have it; the count is what is missing.
    expect(deliveryState({ notification_id: 'n-1', delivered_count: 0 })).toBe('delivered');
  });

  it('reports a row the ledger never heard back about as UNCONFIRMED, not failed', () => {
    // "Failed, nothing was delivered" is a claim we cannot make: this state is
    // reached both when the fanout threw and when it fully succeeded and only
    // the write-back afterwards failed.
    expect(deliveryState({ notification_id: null, delivered_count: 0 })).toBe('unconfirmed');
  });
});

// ---------------------------------------------------------------------------
// 4. The send path
// ---------------------------------------------------------------------------

interface Op {
  table: string;
  op: 'select' | 'insert' | 'update';
  payload: any;
  filters: Record<string, any>;
  range: [number, number] | null;
  /** The column list asked for — the deploy-order tests turn on it. */
  columns: string;
}

/** A Supabase query builder just real enough for this service's calls. */
function makeClient(handle: (op: Op) => { data: any; error: any }) {
  const ops: Op[] = [];
  const client: any = {
    from(table: string) {
      const state: Op = {
        table,
        op: 'select',
        payload: null,
        filters: {},
        range: null,
        columns: '',
      };
      const settle = () => {
        ops.push(state);
        return Promise.resolve(handle(state));
      };
      const builder: any = {
        select: (c?: string) => ((state.columns = c ?? ''), builder),
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

/** Two registrations, both reachable. */
const REGISTRATIONS = [
  { profile_id: 'p-1', learner_id: null, status: 'registered' },
  { profile_id: 'p-2', learner_id: null, status: 'confirmed' },
];

const ledgerRow = (over: Record<string, any> = {}) => ({
  id: 'msg-1',
  subject: SUBJECT,
  body: BODY,
  audience_total: 2,
  recipient_count: 2,
  unreachable_count: 0,
  delivered_count: 0,
  notification_id: null,
  sent_by: 'actor-1',
  sent_at: '2026-09-13T10:00:00.000Z',
  resend_of: null,
  ...over,
});

beforeEach(() => {
  fanout.mockReset();
  fanout.mockResolvedValue({ notified: 2, notificationId: 'notif-1' });
});

const send = (client: any, token: string, resendOf: string | null = null) =>
  sendRegistrantMessage(client, {
    eventId: EVENT,
    eventName: 'Induction 2026',
    actorId: 'actor-1',
    input: { subject: SUBJECT, body: BODY, clientToken: token, resendOf },
  });

describe('sendRegistrantMessage — a deliberate resend', () => {
  it('records the message it repeats, so the history can say so afterwards', async () => {
    const { client, ops } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return ok(ledgerRow({ id: 'msg-2', resend_of: 'msg-1' }));
      if (op.op === 'update') return ok(ledgerRow({ id: 'msg-2', resend_of: 'msg-1', delivered_count: 2, notification_id: 'notif-1' }));
      return ok(null);
    });

    const result = await send(client, TOKEN_B, 'msg-1');

    const insert = ops.find((o) => o.op === 'insert');
    expect(insert?.payload.resend_of).toBe('msg-1');
    expect(result.message.resend_of).toBe('msg-1');
    expect(result.deduplicated).toBe(false);
  });

  it('leaves resend_of null on a first send', async () => {
    const { client, ops } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return ok(ledgerRow());
      if (op.op === 'update') return ok(ledgerRow({ delivered_count: 2, notification_id: 'notif-1' }));
      return ok(null);
    });

    await send(client, TOKEN_A);

    expect(ops.find((o) => o.op === 'insert')?.payload.resend_of).toBeNull();
  });

  it('DELIVERS AGAIN — the resend gets its own fanout key, not the original\'s', async () => {
    // This is the point of the whole change. A resend that reused the first
    // row's idempotency key would be swallowed by the fanout and the organiser
    // would be exactly where the ruling found them: unable to retry.
    const { client } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return ok(ledgerRow({ id: 'msg-2', resend_of: 'msg-1' }));
      if (op.op === 'update') return ok(ledgerRow({ id: 'msg-2', delivered_count: 2, notification_id: 'notif-2' }));
      return ok(null);
    });

    await send(client, TOKEN_B, 'msg-1');

    expect(fanout).toHaveBeenCalledTimes(1);
    expect(fanout.mock.calls[0][1].idempotencyKey).toBe(fanoutKey('msg-2'));
    expect(fanout.mock.calls[0][1].idempotencyKey).not.toBe(fanoutKey('msg-1'));
    expect(fanout.mock.calls[0][1].userIds).toEqual(['p-1', 'p-2']);
  });

  it('a DOUBLE CLICK on "Send again" still delivers only once', async () => {
    // The accident guard must survive the deliberate path. Same token twice →
    // the UNIQUE claim collapses the second onto the first, which already
    // delivered, so no fanout runs at all.
    const delivered = ledgerRow({ id: 'msg-2', resend_of: 'msg-1', delivered_count: 2, notification_id: 'notif-2' });
    const { client } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return { data: null, error: { code: '23505' } };
      if (op.op === 'select' && op.table === 'event_registrant_messages') return ok(delivered);
      return ok(null);
    });

    const result = await send(client, TOKEN_B, 'msg-1');

    expect(fanout).not.toHaveBeenCalled();
    expect(result.deduplicated).toBe(true);
    expect(result.message.id).toBe('msg-2');
  });
});

describe('sendRegistrantMessage — a failed write-back is not a failed send', () => {
  it('does not throw, and reports the recipients the fanout actually reached', async () => {
    // The fanout has already run by this line. Throwing would answer 500, leave
    // the row at "delivered to 0", and send the organiser back to press send on
    // an announcement every registrant can already read.
    const { client, ops } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return ok(ledgerRow());
      if (op.op === 'update') return { data: null, error: { code: '57014', message: 'canceled' } };
      return ok(null);
    });

    const result = await send(client, TOKEN_A);

    expect(result.message.delivered_count).toBe(2);
    expect(result.message.notification_id).toBe('notif-1');
    // Tried, then gave up rather than throwing — twice, not forever.
    expect(ops.filter((o) => o.op === 'update')).toHaveLength(2);
  });

  it('still reports delivery when the fanout skipped as already-sent', async () => {
    // fanoutNotification returns notified: 0 on its idempotent skip AFTER
    // re-asserting a link for every recipient. Writing that 0 through is the
    // original "Delivered to 0 of 2" falsehood.
    fanout.mockResolvedValue({ notified: 0, notificationId: 'notif-1', skipped: 'idempotent' });
    const { client, ops } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return ok(ledgerRow());
      if (op.op === 'update') return ok(ledgerRow({ ...op.payload }));
      return ok(null);
    });

    const result = await send(client, TOKEN_A);

    expect(ops.find((o) => o.op === 'update')?.payload.delivered_count).toBe(2);
    expect(result.message.delivered_count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Deploying BEFORE the migration applies
// ---------------------------------------------------------------------------
// Code ships ahead of migrations in this repo, and PostgREST refuses the WHOLE
// query when one named column is absent. So on the day this deploys `resend_of`
// does not exist — and naming it unconditionally would take the entire Messages
// panel down for a feature that otherwise still works.
//
// The module remembers "missing" for a minute, so each of these tests loads a
// FRESH copy of it rather than inheriting the previous test's verdict.

/** A fresh module instance, so the resend-column probe starts un-decided. */
async function freshService() {
  vi.resetModules();
  return import('@/lib/services/events/organiser-message-service');
}

/** What PostgREST answers for a SELECT naming a column that is not there. */
const undefinedColumn = {
  data: null,
  error: {
    code: '42703',
    message: 'column event_registrant_messages.resend_of does not exist',
    details: null,
  },
};

/** What PostgREST answers for an INSERT naming one — a different code entirely. */
const schemaCacheMiss = {
  data: null,
  error: {
    code: 'PGRST204',
    message:
      "Could not find the 'resend_of' column of 'event_registrant_messages' in the schema cache",
    details: null,
  },
};

describe('before 20261205141500 is applied — the panel must not go dark', () => {
  it('reads the sent log without resend_of, instead of failing the whole query', async () => {
    const svc = await freshService();
    const { client, ops } = makeClient((op) => {
      if (op.table === 'profiles') return ok([]);
      if (op.columns.includes('resend_of')) return undefinedColumn;
      return ok([ledgerRow({ resend_of: undefined })]);
    });

    const rows = await svc.listSentMessages(client, EVENT, 20);

    // It tried the column, was told it is not there, and read again without it.
    const reads = ops.filter((o) => o.table === 'event_registrant_messages');
    expect(reads).toHaveLength(2);
    expect(reads[0].columns).toContain('resend_of');
    expect(reads[1].columns).not.toContain('resend_of');
    // The panel still renders, and a row read without the column says null
    // rather than undefined — "not a repeat", which is what it means.
    expect(rows).toHaveLength(1);
    expect(rows[0].resend_of).toBeNull();
  });

  it('SENDS a first message, without naming a column the database does not have', async () => {
    const svc = await freshService();
    const { client, ops } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') {
        if ('resend_of' in (op.payload ?? {})) return schemaCacheMiss;
        return ok(ledgerRow({ resend_of: undefined }));
      }
      if (op.op === 'update') return ok(ledgerRow({ ...op.payload }));
      return ok(null);
    });

    const result = await svc.sendRegistrantMessage(client, {
      eventId: EVENT,
      eventName: 'Induction 2026',
      actorId: 'actor-1',
      input: { subject: SUBJECT, body: BODY, clientToken: TOKEN_A, resendOf: null },
    });

    expect(fanout).toHaveBeenCalledTimes(1);
    expect(result.message.delivered_count).toBe(2);
    const inserts = ops.filter((o) => o.op === 'insert');
    expect(inserts).toHaveLength(2);
    expect('resend_of' in inserts[1].payload).toBe(false);
  });

  it('REFUSES a deliberate resend rather than filing it as a first send', async () => {
    // The alternative is the worst outcome this feature has: a second blast to
    // real learners, recorded as though it were the first.
    const svc = await freshService();
    const { client } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return schemaCacheMiss;
      return ok(null);
    });

    await expect(
      svc.sendRegistrantMessage(client, {
        eventId: EVENT,
        eventName: 'Induction 2026',
        actorId: 'actor-1',
        input: { subject: SUBJECT, body: BODY, clientToken: TOKEN_B, resendOf: 'msg-1' },
      })
    ).rejects.toBeInstanceOf(svc.ResendNotRecordableError);

    expect(fanout).not.toHaveBeenCalled();
  });

  it('does not swallow a DIFFERENT missing column as if it were resend_of', async () => {
    // The fallback is allowed to hide exactly one absence. Anything else is a
    // real fault and has to surface.
    const svc = await freshService();
    const { client, ops } = makeClient(() => ({
      data: null,
      error: {
        code: '42703',
        message: 'column event_registrant_messages.delivered_count does not exist',
        details: null,
      },
    }));

    await expect(svc.listSentMessages(client, EVENT, 20)).rejects.toMatchObject({ code: '42703' });
    expect(ops).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6. The race the read-then-insert guard cannot win
// ---------------------------------------------------------------------------
// findContentDuplicate reads and then the route inserts. Two composes of the
// same words under DIFFERENT tokens — two tabs, two organisers, a compose
// racing a resend — both pass the read. UNIQUE (event_id, client_token) does
// not constrain content, so only the database's own content index stops the
// second one, and it has to stop it BEFORE anything is delivered.

const contentUnique = {
  data: null,
  error: {
    code: '23505',
    message:
      'duplicate key value violates unique constraint "uq_event_registrant_messages_first_send_content"',
    details: 'Key (event_id, md5)=(event-1, abc) already exists.',
  },
};

describe('sendRegistrantMessage — the database closes the duplicate race', () => {
  it('DELIVERS NOTHING when a concurrent send got the same words in first', async () => {
    const svc = await freshService();
    const winner = {
      id: 'msg-winner',
      subject: SUBJECT,
      body: BODY,
      client_token: TOKEN_A,
      sent_at: '2026-09-13T10:00:00.000Z',
      notification_id: 'notif-1',
      delivered_count: 2,
    };
    const { client } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return contentUnique;
      return ok([winner]);
    });

    const failure = await svc
      .sendRegistrantMessage(client, {
        eventId: EVENT,
        eventName: 'Induction 2026',
        actorId: 'actor-1',
        input: { subject: SUBJECT, body: BODY, clientToken: TOKEN_B, resendOf: null },
      })
      .then(
        () => null,
        (e: any) => e
      );

    expect(failure).toBeInstanceOf(svc.ContentDuplicateError);
    // It names the row that won, so the refusal can point at it.
    expect(failure.duplicate?.id).toBe('msg-winner');
    // The whole point: the loser sent nothing to anybody.
    expect(fanout).not.toHaveBeenCalled();
  });

  it('still treats a repeat of the SAME token as a double click, not a race', async () => {
    // The two constraints answer with the same SQLSTATE. Telling them apart by
    // name is what keeps a double click collapsing onto its first row instead
    // of being reported to the organiser as somebody else's duplicate.
    const svc = await freshService();
    const tokenUnique = {
      data: null,
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "event_registrant_messages_event_id_client_token_key"',
        details: null,
      },
    };
    const { client } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return tokenUnique;
      if (op.filters.client_token === TOKEN_A) {
        return ok(ledgerRow({ delivered_count: 2, notification_id: 'notif-1' }));
      }
      return ok(null);
    });

    const result = await svc.sendRegistrantMessage(client, {
      eventId: EVENT,
      eventName: 'Induction 2026',
      actorId: 'actor-1',
      input: { subject: SUBJECT, body: BODY, clientToken: TOKEN_A, resendOf: null },
    });

    expect(result.deduplicated).toBe(true);
    expect(fanout).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. A write-back that records nothing is a failure even when nobody errored
// ---------------------------------------------------------------------------

describe('the ledger write-back is abandoned LOUDLY, on every path', () => {
  it('retries and gives up when the update matches no row and reports no error', async () => {
    // PostgREST answers an UPDATE that matched nothing with data null AND error
    // null. Read as success, that path stopped after one attempt, logged
    // nothing, and still returned the counts as though the row had been
    // written — the one abandonment nobody would ever find.
    const svc = await freshService();
    const { client, ops } = makeClient((op) => {
      if (op.table === 'events_registrations') return ok(op.range?.[0] === 0 ? REGISTRATIONS : []);
      if (op.table === 'profiles') return ok([]);
      if (op.op === 'insert') return ok(ledgerRow());
      if (op.op === 'update') return ok(null);
      return ok(null);
    });

    const result = await svc.sendRegistrantMessage(client, {
      eventId: EVENT,
      eventName: 'Induction 2026',
      actorId: 'actor-1',
      input: { subject: SUBJECT, body: BODY, clientToken: TOKEN_A, resendOf: null },
    });

    // Twice, exactly as the PR claims — not once, and not forever.
    expect(ops.filter((o) => o.op === 'update')).toHaveLength(2);
    // And the answer still tells the organiser the truth about the fanout.
    expect(result.message.delivered_count).toBe(2);
  });
});
