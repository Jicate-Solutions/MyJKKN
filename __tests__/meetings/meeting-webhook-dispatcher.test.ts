// __tests__/meetings/meeting-webhook-dispatcher.test.ts
//
// MODULE 9 — unit suite for the webhook dispatcher. Two halves:
//   1. signPayload — HMAC-SHA256 correctness against a hand-computed vector
//      (the receiver MUST be able to recompute this, so it is load-bearing).
//   2. dispatchDue — drives the worker with a hand-rolled fake Supabase client
//      and a mocked global fetch, asserting the sent / failed-retry /
//      failed-give-up / inactive-webhook state transitions.

import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchDue, signPayload } from '@/lib/services/meetings/meeting-webhook-dispatcher';

// ---------------------------------------------------------------------------
// signPayload
// ---------------------------------------------------------------------------
describe('signPayload', () => {
  it('produces sha256=<hex hmac> matching an independent computation', () => {
    const secret = 'test-secret-1234567890';
    const body = JSON.stringify({ event: 'booking.created', booking: { id: 'abc' } });
    const expected =
      'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    expect(signPayload(secret, body)).toBe(expected);
  });

  it('is stable for the same input and changes when the body changes', () => {
    const secret = 's';
    const a = signPayload(secret, '{"x":1}');
    const b = signPayload(secret, '{"x":1}');
    const c = signPayload(secret, '{"x":2}');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('changes when the secret changes', () => {
    const body = '{"x":1}';
    expect(signPayload('one', body)).not.toBe(signPayload('two', body));
  });
});

// ---------------------------------------------------------------------------
// Fake Supabase client — just enough surface for dispatchDue.
//   .from('meeting_webhook_deliveries')
//     .select(...).eq(...).lte(...).order(...).limit(...)  -> { data, error }
//     .update(patch).eq('id', x)                           -> records the patch
// ---------------------------------------------------------------------------
interface Patch {
  id: string;
  patch: Record<string, unknown>;
}

function makeClient(dueRows: unknown[]) {
  const updates: Patch[] = [];

  const selectChain = {
    eq() {
      return this;
    },
    lte() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: dueRows, error: null });
    },
  };

  const client = {
    from(_table: string) {
      return {
        select() {
          return selectChain;
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              updates.push({ id, patch });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { client: client as never, updates };
}

function dueRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'd1',
    webhook_id: 'w1',
    event: 'booking.created',
    payload: { event: 'booking.created', booking: { id: 'b1' } },
    attempts: 0,
    meeting_webhooks: {
      target_url: 'https://example.com/hook',
      signing_secret: 'sek',
      is_active: true,
    },
    ...over,
  };
}

const NOW = new Date('2026-06-17T10:00:00.000Z');

describe('dispatchDue', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks a delivery sent on a 2xx and signs the exact body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { client, updates } = makeClient([dueRow()]);
    const summary = await dispatchDue(client, NOW);

    expect(summary.picked).toBe(1);
    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(0);

    // fetch called once with the signature header over the exact body bytes.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = init.body as string;
    expect(init.headers['X-MyJKKN-Signature']).toBe(signPayload('sek', body));
    expect(init.headers['X-MyJKKN-Event']).toBe('booking.created');

    // delivery row updated to sent.
    expect(updates).toHaveLength(1);
    expect(updates[0].patch.status).toBe('sent');
    expect(updates[0].patch.response_code).toBe(200);
    expect(updates[0].patch.attempts).toBe(1);
  });

  it('retries (stays pending, backs off) on a 500 under the attempt cap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 500 } as Response));

    const { client, updates } = makeClient([dueRow({ attempts: 0 })]);
    const summary = await dispatchDue(client, NOW);

    expect(summary.failed).toBe(1);
    expect(updates[0].patch.status).toBe('pending'); // not given up
    expect(updates[0].patch.attempts).toBe(1);
    expect(updates[0].patch.response_code).toBe(500);
    // scheduled_for pushed into the future (backoff)
    const next = new Date(updates[0].patch.scheduled_for as string).getTime();
    expect(next).toBeGreaterThan(NOW.getTime());
  });

  it('gives up (status failed) once attempts reach the cap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503 } as Response));

    // attempts:4 -> attemptsAfter 5 == MAX_ATTEMPTS -> give up
    const { client, updates } = makeClient([dueRow({ attempts: 4 })]);
    await dispatchDue(client, NOW);

    expect(updates[0].patch.status).toBe('failed');
    expect(updates[0].patch.attempts).toBe(5);
  });

  it('treats a fetch/network error as a failed attempt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const { client, updates } = makeClient([dueRow({ attempts: 0 })]);
    const summary = await dispatchDue(client, NOW);

    expect(summary.failed).toBe(1);
    expect(updates[0].patch.status).toBe('pending');
    expect(updates[0].patch.error).toBe('ECONNREFUSED');
    expect(updates[0].patch.response_code).toBeNull();
  });

  it('skips + closes a delivery whose webhook went inactive, without POSTing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { client, updates } = makeClient([
      dueRow({ meeting_webhooks: { target_url: 'https://x', signing_secret: 's', is_active: false } }),
    ]);
    const summary = await dispatchDue(client, NOW);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(updates[0].patch.status).toBe('failed');
    expect(updates[0].patch.error).toBe('webhook inactive');
  });

  it('returns an empty summary when nothing is due', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { client } = makeClient([]);
    const summary = await dispatchDue(client, NOW);
    expect(summary).toMatchObject({ picked: 0, sent: 0, failed: 0, skipped: 0 });
  });
});
