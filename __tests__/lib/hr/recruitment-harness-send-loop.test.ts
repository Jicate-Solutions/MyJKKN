import { describe, it, expect, vi, beforeEach } from 'vitest';

// Follow-up to the #4149 review: the send loop of the recruitment nudges.
//   finding 1 — a send that returns without reaching anyone keeps its claim
//   finding 2 — one college's failed HR-editor lookup does not stop the run
//   finding 3 — a claim whose send never finished is re-armed by a later run

const fanout = vi.fn();
vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: (...args: unknown[]) => fanout(...args),
}));

import { claimAndSend, loadHrEditors, releaseStaleClaims } from '@/lib/hr/recruitment/harness-run';
import { STALE_CLAIM_MINUTES, staleUnsentClaims, type Nudge, type SentNudge } from '@/lib/hr/recruitment/harness-selection';

// ---------------------------------------------------------------------------
// A tiny fake of the Supabase client that records every write.
// ---------------------------------------------------------------------------

type Op = { op: 'insert' | 'update' | 'delete'; table: string; payload?: unknown; filters: [string, string, unknown][] };

function fakeDb(opts: {
  insert?: { data: unknown; error: unknown };
  deleteReturns?: { data: unknown; error: unknown };
  rpc?: (args: { p_institution_id: string | null }) => Promise<{ data: unknown; error: unknown }>;
} = {}) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      let current: Op | null = null;
      const q: any = {
        insert(payload: unknown) {
          current = { op: 'insert', table, payload, filters: [] };
          ops.push(current);
          return q;
        },
        update(payload: unknown) {
          current = { op: 'update', table, payload, filters: [] };
          ops.push(current);
          return q;
        },
        delete() {
          current = { op: 'delete', table, filters: [] };
          ops.push(current);
          return q;
        },
        select: () => q,
        eq(col: string, val: unknown) {
          current?.filters.push(['eq', col, val]);
          return q;
        },
        in(col: string, val: unknown) {
          current?.filters.push(['in', col, val]);
          return q;
        },
        is(col: string, val: unknown) {
          current?.filters.push(['is', col, val]);
          return q;
        },
        maybeSingle: async () => opts.insert ?? { data: { id: 'claim-1' }, error: null },
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          const answer = current?.op === 'delete' && opts.deleteReturns ? opts.deleteReturns : { data: null, error: null };
          return Promise.resolve(answer).then(resolve, reject);
        },
      };
      return q;
    },
    rpc: (_fn: string, args: { p_institution_id: string | null }) =>
      opts.rpc ? opts.rpc(args) : Promise.resolve({ data: [], error: null }),
  };
  return { db: db as any, ops };
}

const NUDGE: Nudge = {
  kind: 'approval_reminder',
  refKey: 'cand-1:0',
  candidateId: 'cand-1',
  recipients: ['user-1'],
  title: 't',
  body: 'b',
  url: '/hr/recruitment/approvals',
};

// A block, not an expression: vitest runs a function returned from beforeEach as
// a cleanup hook, and mockReset() returns the mock itself.
beforeEach(() => {
  fanout.mockReset();
});

// ---------------------------------------------------------------------------
// Finding 1
// ---------------------------------------------------------------------------

describe('claimAndSend — when a claim is released', () => {
  it('a send that returns without reaching anyone keeps the claim as found-nobody (not retried daily)', async () => {
    fanout.mockResolvedValue({ notified: 0 });
    const { db, ops } = fakeDb();
    expect(await claimAndSend(db, NUDGE, null)).toBe('no_recipient');
    expect(ops.some((o) => o.op === 'delete')).toBe(false);
    const mark = ops.find((o) => o.op === 'update');
    expect(mark?.payload).toEqual({ recipient_ids: [] });
    expect(mark?.filters).toContainEqual(['eq', 'id', 'claim-1']);
  });

  it('a send that throws releases the claim so the next run retries', async () => {
    fanout.mockImplementation(async () => { throw new Error('network down'); });
    const { db, ops } = fakeDb();
    expect(await claimAndSend(db, NUDGE, null)).toBe('failed');
    const del = ops.find((o) => o.op === 'delete');
    expect(del?.filters).toContainEqual(['eq', 'id', 'claim-1']);
  });

  it('a send that lands records the notification id and keeps the claim', async () => {
    fanout.mockResolvedValue({ notified: 1, notificationId: 'notif-1' });
    const { db, ops } = fakeDb();
    expect(await claimAndSend(db, NUDGE, null)).toBe('sent');
    expect(ops.some((o) => o.op === 'delete')).toBe(false);
    expect(ops.find((o) => o.op === 'update')?.payload).toEqual({ notification_id: 'notif-1' });
  });
});

// ---------------------------------------------------------------------------
// Finding 2
// ---------------------------------------------------------------------------

describe('loadHrEditors — one college failing does not stop the run', () => {
  it('a failed lookup marks only that college unavailable; the others still load', async () => {
    const { db } = fakeDb({
      rpc: async ({ p_institution_id }) =>
        p_institution_id === 'college-bad'
          ? { data: null, error: { message: 'boom' } }
          : { data: [`editor-of-${p_institution_id ?? 'none'}`], error: null },
    });
    const { editorsOf, unavailable } = await loadHrEditors(db, ['college-a', 'college-bad', null, 'college-a']);
    expect(Array.from(unavailable)).toEqual(['college-bad']);
    expect(editorsOf.get('college-a')).toEqual(['editor-of-college-a']);
    expect(editorsOf.get('none')).toEqual(['editor-of-none']);
    // NOT [] — an empty list would record a terminal found-nobody claim.
    expect(editorsOf.has('college-bad')).toBe(false);
  });

  it('a lookup that throws is handled the same way', async () => {
    const { db } = fakeDb({
      rpc: async ({ p_institution_id }) => {
        if (p_institution_id === 'college-bad') throw new Error('socket hang up');
        return { data: [], error: null };
      },
    });
    const { unavailable } = await loadHrEditors(db, ['college-bad', 'college-a']);
    expect(Array.from(unavailable)).toEqual(['college-bad']);
  });
});

// ---------------------------------------------------------------------------
// Finding 3
// ---------------------------------------------------------------------------

describe('staleUnsentClaims / releaseStaleClaims — a run killed mid-send', () => {
  const NOW = new Date('2026-10-10T04:00:00Z');
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
  const row = (over: Partial<SentNudge>): SentNudge => ({
    id: 'row',
    kind: 'approval_reminder',
    ref_key: 'cand-1:0',
    sent_at: minutesAgo(STALE_CLAIM_MINUTES + 5),
    notification_id: null,
    recipient_ids: ['user-1'],
    ...over,
  });

  it('re-arms only an old claim that had people to tell and never recorded a notification', () => {
    const rows = [
      row({ id: 'stale' }),
      row({ id: 'sent', notification_id: 'notif-1' }),
      row({ id: 'found-nobody', recipient_ids: [] }),
      row({ id: 'in-progress', sent_at: minutesAgo(1) }),
      row({ id: 'unreadable', sent_at: 'not a date' }),
      row({ id: undefined }),
    ];
    expect(staleUnsentClaims(rows, NOW)).toEqual(['stale']);
  });

  it('deletes only rows still without a notification, and returns what was released', async () => {
    const { db, ops } = fakeDb({ deleteReturns: { data: [{ id: 'stale' }], error: null } });
    const released = await releaseStaleClaims(db, [row({ id: 'stale' }), row({ id: 'fresh', sent_at: minutesAgo(1) })], NOW);
    expect(Array.from(released)).toEqual(['stale']);
    const del = ops.find((o) => o.op === 'delete');
    expect(del?.filters).toContainEqual(['in', 'id', ['stale']]);
    expect(del?.filters).toContainEqual(['is', 'notification_id', null]);
  });

  it('a failed delete releases nothing (so nothing is re-sent)', async () => {
    const { db } = fakeDb({ deleteReturns: { data: null, error: { message: 'boom' } } });
    expect((await releaseStaleClaims(db, [row({ id: 'stale' })], NOW)).size).toBe(0);
  });
});
