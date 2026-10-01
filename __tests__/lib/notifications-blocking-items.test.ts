/**
 * mapBlockingItems — the one mapping shared by /api/notifications/pulse and
 * /api/notifications/acknowledge (2026-09-16).
 *
 * Load-bearing: ack rows keep EXACTLY the derived fields the gate always had
 * (deadline_at = sent_at + deadline hours, is_overdue), bug-feedback rows carry
 * the snooze state the gate decides "Ask me later" from, and an untagged row
 * (older payload) still reads as an ack.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  attachAnswersToReaders,
  mapBlockingItems,
  fetchBlockingItems,
  isMissingBlockingSchema,
  BUG_FEEDBACK_MAX_SNOOZES
} from '@/lib/notifications/blocking-items';

const NOW = new Date('2026-09-16T10:00:00.000Z');

describe('mapBlockingItems', () => {
  it('maps an ack row exactly as before (deadline from sent_at + hours, overdue flag)', () => {
    const [item] = mapBlockingItems(
      [
        {
          kind: 'ack',
          id: 'un-1',
          notification_id: 'n-1',
          title: 'Fee circular',
          body: 'Read me',
          priority: 'high',
          category: 'finance',
          url: null,
          created_by_name: null,
          sent_at: '2026-09-16T01:00:00.000Z',
          created_at: '2026-09-16T01:00:00.000Z',
          acknowledgment_deadline_hours: 4,
          metadata: null
        }
      ],
      NOW
    );
    expect(item).toMatchObject({
      kind: 'ack',
      id: 'un-1',
      notification_id: 'n-1',
      created_by_name: 'System',
      deadline_at: '2026-09-16T05:00:00.000Z',
      is_overdue: true
    });
    expect(item.answer_options).toBeUndefined();
    expect(item.request_id).toBeUndefined();
  });

  it('treats a row with no kind as an ack (older RPC payloads)', () => {
    const [item] = mapBlockingItems([{ id: 'x', notification_id: 'n', sent_at: '2026-09-16T09:00:00.000Z' }], NOW);
    expect(item.kind).toBe('ack');
    expect(item.is_overdue).toBe(false);
  });

  it('carries the answer options for a must-answer row', () => {
    const [item] = mapBlockingItems(
      [{ kind: 'answer', id: 'un-2', notification_id: 'n-2', sent_at: '2026-09-16T09:00:00.000Z', answer_options: ['Yes', 'No', 3] }],
      NOW
    );
    expect(item.kind).toBe('answer');
    expect(item.answer_options).toEqual(['Yes', 'No', '3']);
  });

  it('an answer row with no ack clock is never OVERDUE on the 4-hour default (deep review #9)', () => {
    const sent = '2026-09-10T00:00:00.000Z'; // NOW is days later
    const [noClock, withExpiry, withHours] = mapBlockingItems(
      [
        { kind: 'answer', id: 'a-1', notification_id: 'n-1', sent_at: sent, answer_options: ['Yes', 'No'] },
        { kind: 'answer', id: 'a-2', notification_id: 'n-2', sent_at: sent, answer_options: ['Yes', 'No'], expires_at: '2026-12-01T00:00:00.000Z' },
        { kind: 'answer', id: 'a-3', notification_id: 'n-3', sent_at: sent, answer_options: ['Yes', 'No'], acknowledgment_deadline_hours: 2 }
      ],
      NOW
    );
    expect(noClock.is_overdue).toBe(false);
    expect(withExpiry).toMatchObject({ deadline_at: '2026-12-01T00:00:00.000Z', is_overdue: false });
    expect(withHours.is_overdue).toBe(true); // an ack clock the sender set still counts
  });

  it('maps a bug-feedback row: never overdue, deadline = expires_at, can_snooze below the cap', () => {
    const rows = [
      {
        kind: 'bug_feedback',
        id: 'req-1',
        notification_id: 'req-1',
        title: 'You reported BUG-1 — is it fixed for you?',
        body: 'It broke',
        sent_at: '2026-09-10T00:00:00.000Z',
        expires_at: '2026-11-09T00:00:00.000Z',
        request_id: 'req-1',
        bug_id: 'bug-1',
        display_id: 'BUG-1',
        snooze_count: 2
      },
      { kind: 'bug_feedback', id: 'req-2', notification_id: 'req-2', sent_at: '2026-09-10T00:00:00.000Z', expires_at: '2026-11-09T00:00:00.000Z', request_id: 'req-2', snooze_count: BUG_FEEDBACK_MAX_SNOOZES }
    ];
    const [a, b] = mapBlockingItems(rows, NOW);
    expect(a).toMatchObject({
      kind: 'bug_feedback',
      request_id: 'req-1',
      display_id: 'BUG-1',
      deadline_at: '2026-11-09T00:00:00.000Z',
      is_overdue: false,
      snooze_count: 2,
      can_snooze: true,
      created_by_name: 'MyJKKN bug fixes'
    });
    expect(b.can_snooze).toBe(false);
  });

  it('returns an empty list for null input', () => {
    expect(mapBlockingItems(null)).toEqual([]);
  });
});

/**
 * fetchBlockingItems — the missing-migration path (blind-critic gap 4,
 * 2026-09-18).
 *
 * The ship wave merges code and applies migrations in separate rounds, so the
 * built app can call get_blocking_items against a database that has never
 * heard of it. Every signed-in page polls this through /api/notifications/pulse
 * every 60 s; before this, each of those polls answered 500 and the gate showed
 * its error state to everyone until the migrations landed.
 */
describe('fetchBlockingItems — degrading when the migrations are not applied', () => {
  afterEach(() => vi.restoreAllMocks());

  const ackRow = { kind: 'ack', id: 'un-1', notification_id: 'n-1', sent_at: '2026-09-16T09:00:00.000Z' };

  function client(answers: Record<string, { data: any; error: any }>) {
    const rpc = vi.fn((fn: string) =>
      Promise.resolve(answers[fn] ?? { data: null, error: { code: '42883', message: `no ${fn}` } })
    );
    return { rpc };
  }

  it('recognises the four codes a pending migration produces, and nothing else', () => {
    for (const code of ['42883', '42703', 'PGRST202', 'PGRST204']) {
      expect(isMissingBlockingSchema({ code, message: 'x' })).toBe(true);
    }
    expect(isMissingBlockingSchema({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(isMissingBlockingSchema({ message: 'boom' })).toBe(false);
    expect(isMissingBlockingSchema(null)).toBe(false);
    // PostgREST does not always set a code; its wording names the missing object.
    expect(
      isMissingBlockingSchema({
        message: 'Could not find the function public.get_blocking_items(p_user_id) in the schema cache'
      })
    ).toBe(true);
  });

  it('serves the rows when the function is there (no fallback call)', async () => {
    const c = client({ get_blocking_items: { data: [ackRow], error: null } });
    const res = await fetchBlockingItems(c, 'user-1', NOW);
    expect(res.error).toBeNull();
    expect(res.degraded).toBe(false);
    expect(res.items).toHaveLength(1);
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.rpc).toHaveBeenCalledWith('get_blocking_items', { p_user_id: 'user-1' });
  });

  it('a missing function (42883) falls back to the pre-existing queue, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = client({
      get_blocking_items: { data: null, error: { code: '42883', message: 'function does not exist' } },
      get_unacknowledged_notifications: { data: [ackRow], error: null }
    });

    const res = await fetchBlockingItems(c, 'user-1', NOW);

    // Mandatory acknowledgments keep blocking; the two new kinds just do not appear.
    expect(res.error).toBeNull();
    expect(res.degraded).toBe(true);
    expect(res.items).toHaveLength(1);
    expect(res.items![0].kind).toBe('ack');
    expect(c.rpc).toHaveBeenCalledWith('get_unacknowledged_notifications', { p_user_id: 'user-1' });
    expect(warn).toHaveBeenCalled();
  });

  it('a missing column (42703) degrades the same way', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = client({
      get_blocking_items: { data: null, error: { code: '42703', message: 'column r.ask_after does not exist' } },
      get_unacknowledged_notifications: { data: [], error: null }
    });
    const res = await fetchBlockingItems(c, 'user-1', NOW);
    expect(res).toMatchObject({ degraded: true, error: null });
    expect(res.items).toEqual([]);
  });

  it('a fallback that FAILS for any other reason is a fault, not an empty queue (critic round 2)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = client({
      get_blocking_items: { data: null, error: { code: '42883', message: 'function does not exist' } },
      get_unacknowledged_notifications: { data: null, error: { code: '42501', message: 'permission denied' } }
    });
    const res = await fetchBlockingItems(c, 'user-1', NOW);
    expect(res.items).toBeNull();
    expect(res.error).toMatchObject({ code: '42501' });
  });

  it('no blocking items at all when the fallback is missing too — never an error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = client({}); // every RPC answers 42883
    const res = await fetchBlockingItems(c, 'user-1', NOW);
    expect(res).toEqual({ items: [], degraded: true, error: null });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('passes a REAL fault straight back so the route can still answer 500', async () => {
    const c = client({
      get_blocking_items: { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
    });
    const res = await fetchBlockingItems(c, 'user-1', NOW);
    expect(res.items).toBeNull();
    expect(res.degraded).toBe(false);
    expect(res.error).toMatchObject({ code: '57014' });
    // A timeout must NOT be papered over with an empty queue.
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('attachAnswersToReaders', () => {
  it('adds each reader\'s picked option, null when they have not answered, and leaves everything else alone', () => {
    const analytics = { summary: { total: 2 }, recent_readers: [{ user_id: 'u1', name: 'A' }, { user_id: 'u2', name: 'B' }] };
    const out = attachAnswersToReaders(analytics, [{ user_id: 'u2', answer: 'No' }]);
    expect(out.summary).toEqual({ total: 2 });
    expect(out.recent_readers).toEqual([
      { user_id: 'u1', name: 'A', answer: null },
      { user_id: 'u2', name: 'B', answer: 'No' }
    ]);
  });
  it('is a no-op without a readers list or without answers', () => {
    expect(attachAnswersToReaders({ recent_readers: null } as any, [])).toEqual({ recent_readers: null });
    expect(attachAnswersToReaders({ recent_readers: [{ user_id: 'u1' }] }, null).recent_readers).toEqual([{ user_id: 'u1', answer: null }]);
  });
});

