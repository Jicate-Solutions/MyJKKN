import { describe, it, expect, vi, beforeEach } from 'vitest';

// Follow-up to the #4149 review: the send loop of the recruitment nudges.
//   finding 1 — a send that returns without reaching anyone keeps its claim
//   finding 2 — one college's failed HR-editor lookup does not stop the run
//   finding 3 — a claim whose send never finished is re-armed by a later run
// Follow-up to the #4260 review:
//   finding 1 — a claim whose send LANDED without its id recorded is settled by
//               recording the id (sent_at kept), never released and re-sent
//   finding 2 — a send that returns nothing and no reason is a failure, not
//               a terminal found-nobody record
//   finding 3 — a failed HR-editor lookup holds back only the offers that need it

const fanout = vi.fn();
const ensureLinks = vi.fn();
vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: (...args: unknown[]) => fanout(...args),
  ensureLinks: (...args: unknown[]) => ensureLinks(...args),
}));

import { claimAndSend, loadHrEditors, releaseStaleClaims } from '@/lib/hr/recruitment/harness-run';
import {
  STALE_CLAIM_MINUTES,
  nudgeIdempotencyKey,
  offerCandidatesToCheck,
  staleUnsentClaims,
  type Directory,
  type DirectoryUser,
  type HarnessCandidate,
  type Nudge,
  type SentNudge,
} from '@/lib/hr/recruitment/harness-selection';

// ---------------------------------------------------------------------------
// A tiny fake of the Supabase client that records every write.
// ---------------------------------------------------------------------------

type Op = { op: 'insert' | 'update' | 'delete' | 'select'; table: string; payload?: unknown; filters: [string, string, unknown][] };

function fakeDb(opts: {
  insert?: { data: unknown; error: unknown };
  deleteReturns?: { data: unknown; error: unknown };
  updateReturns?: { data: unknown; error: unknown };
  /** Answer to a paged read (readAll -> .range()) of the given table. */
  reads?: Record<string, { data: unknown; error: unknown }>;
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
        select(cols: string) {
          if (!current) {
            current = { op: 'select', table, payload: cols, filters: [] };
            ops.push(current);
          }
          return q;
        },
        range: async () => opts.reads?.[table] ?? { data: [], error: null },
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
          const answer =
            current?.op === 'delete' && opts.deleteReturns
              ? opts.deleteReturns
              : current?.op === 'update' && opts.updateReturns
                ? opts.updateReturns
                : { data: null, error: null };
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
  ensureLinks.mockReset();
});

// ---------------------------------------------------------------------------
// Finding 1
// ---------------------------------------------------------------------------

describe('claimAndSend — when a claim is released', () => {
  it('a send that explicitly found no recipients keeps the claim as found-nobody (not retried daily)', async () => {
    fanout.mockResolvedValue({ notified: 0, skipped: 'no_recipients' });
    const { db, ops } = fakeDb();
    expect(await claimAndSend(db, NUDGE, null)).toBe('no_recipient');
    expect(ops.some((o) => o.op === 'delete')).toBe(false);
    const mark = ops.find((o) => o.op === 'update');
    expect(mark?.payload).toEqual({ recipient_ids: [] });
    expect(mark?.filters).toContainEqual(['eq', 'id', 'claim-1']);
  });

  it('#4260 f2: a send that returns nothing and no reason is a failure — the claim is not marked found-nobody', async () => {
    // notify.ts: the notifications insert returned no row and no error.
    fanout.mockResolvedValue({ notified: 0 });
    const { db, ops } = fakeDb();
    expect(await claimAndSend(db, NUDGE, null)).toBe('failed');
    // No found-nobody mark (that would start the HR Head's clock) ...
    expect(ops.some((o) => o.op === 'update')).toBe(false);
    // ... and the claim is left with its recipients for the stale settle step.
    expect(ops.some((o) => o.op === 'delete')).toBe(false);
    const claim = ops.find((o) => o.op === 'insert');
    expect((claim?.payload as { recipient_ids: string[] }).recipient_ids).toEqual(['user-1']);
    expect(staleUnsentClaims(
      [{ id: 'claim-1', kind: NUDGE.kind, ref_key: NUDGE.refKey, sent_at: '2026-10-10T03:00:00Z', notification_id: null, recipient_ids: ['user-1'] }],
      new Date('2026-10-10T04:00:00Z'),
    )).toEqual(['claim-1']);
  });

  it('a send that landed but whose id could not be recorded is still a send (the next run records it)', async () => {
    fanout.mockResolvedValue({ notified: 1, notificationId: 'notif-1' });
    const { db, ops } = fakeDb({ updateReturns: { data: null, error: { message: 'boom' } } });
    expect(await claimAndSend(db, NUDGE, null)).toBe('sent');
    expect(ops.some((o) => o.op === 'delete')).toBe(false);
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
    const { released, recorded } = await releaseStaleClaims(db, [row({ id: 'stale' }), row({ id: 'fresh', sent_at: minutesAgo(1) })], NOW);
    expect(Array.from(released)).toEqual(['stale']);
    expect(recorded).toBe(0);
    const del = ops.find((o) => o.op === 'delete');
    expect(del?.filters).toContainEqual(['in', 'id', ['stale']]);
    expect(del?.filters).toContainEqual(['is', 'notification_id', null]);
  });

  it('a failed delete releases nothing (so nothing is re-sent)', async () => {
    const { db } = fakeDb({ deleteReturns: { data: null, error: { message: 'boom' } } });
    expect((await releaseStaleClaims(db, [row({ id: 'stale' })], NOW)).released.size).toBe(0);
  });

  it('#4260 f1: a claim whose send LANDED is recorded with its id and keeps sent_at — never released, never re-sent', async () => {
    const landedRow = row({ id: 'landed', ref_key: 'cand-1:0' });
    const neverRow = row({ id: 'never', ref_key: 'cand-2:0' });
    const { db, ops } = fakeDb({
      reads: {
        notifications: {
          data: [{ id: 'notif-9', idempotency_key: nudgeIdempotencyKey('approval_reminder', 'cand-1:0') }],
          error: null,
        },
      },
      deleteReturns: { data: [{ id: 'never' }], error: null },
    });
    const { released, recorded } = await releaseStaleClaims(db, [landedRow, neverRow], NOW);

    // The lookup is by the nudge's own notification key.
    const lookup = ops.find((o) => o.op === 'select' && o.table === 'notifications');
    expect(lookup?.filters).toContainEqual([
      'in', 'idempotency_key',
      [nudgeIdempotencyKey('approval_reminder', 'cand-1:0'), nudgeIdempotencyKey('approval_reminder', 'cand-2:0')],
    ]);
    // Landed: bell links re-asserted, id recorded on that row only, sent_at untouched.
    expect(ensureLinks).toHaveBeenCalledWith(db, 'notif-9', ['user-1']);
    const mark = ops.find((o) => o.op === 'update');
    expect(mark?.payload).toEqual({ notification_id: 'notif-9' });
    expect(mark?.filters).toContainEqual(['eq', 'id', 'landed']);
    expect(mark?.filters).toContainEqual(['is', 'notification_id', null]);
    expect(recorded).toBe(1);
    // Never sent: released, and ONLY that one.
    const del = ops.find((o) => o.op === 'delete');
    expect(del?.filters).toContainEqual(['in', 'id', ['never']]);
    expect(Array.from(released)).toEqual(['never']);
  });

  it('#4260 f1: the key the settle step looks up is the key the send writes', async () => {
    fanout.mockResolvedValue({ notified: 1, notificationId: 'notif-1' });
    const { db } = fakeDb();
    await claimAndSend(db, NUDGE, null);
    expect(fanout.mock.calls[0][1].idempotencyKey).toBe(nudgeIdempotencyKey(NUDGE.kind, NUDGE.refKey));
  });

  it('#4260 f1: if the notification lookup fails, nothing is released or recorded (no re-send, no clock reset)', async () => {
    const { db, ops } = fakeDb({ reads: { notifications: { data: null, error: { message: 'boom' } } } });
    const { released, recorded } = await releaseStaleClaims(db, [row({ id: 'stale' })], NOW);
    expect(released.size).toBe(0);
    expect(recorded).toBe(0);
    expect(ops.some((o) => o.op === 'delete' || o.op === 'update')).toBe(false);
  });

  it('#4260 f1: if re-asserting the links fails, the landed row is left for the next run — not released', async () => {
    ensureLinks.mockRejectedValue(new Error('links down'));
    const { db, ops } = fakeDb({
      reads: { notifications: { data: [{ id: 'notif-9', idempotency_key: nudgeIdempotencyKey('approval_reminder', 'cand-1:0') }], error: null } },
    });
    const { released, recorded } = await releaseStaleClaims(db, [row({ id: 'landed' })], NOW);
    expect(released.size).toBe(0);
    expect(recorded).toBe(0);
    expect(ops.some((o) => o.op === 'delete' || o.op === 'update')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #4260 finding 3
// ---------------------------------------------------------------------------

describe('offerCandidatesToCheck — a failed HR-editor lookup holds back only the offers that need it', () => {
  const person = (id: string, over: Partial<DirectoryUser> = {}): DirectoryUser => ({
    id, fullName: id, institutionId: 'college-bad', active: true, isSuperAdmin: false,
    roleKeys: [], allScope: false, grantInstitutionIds: [], canEditRecruitment: true, ...over,
  });
  const dir: Directory = {
    users: new Map([
      ['creator-ok', person('creator-ok')],
      ['creator-gone', person('creator-gone', { active: false })],
      ['creator-no-edit', person('creator-no-edit', { canEditRecruitment: false })],
    ]),
    counsellingCodeOf: new Map(),
    roleNameOf: new Map(),
  };
  const cand = (id: string, institution_id: string | null, job_id: string | null): HarnessCandidate => ({
    id, name: id, role_title: 'Lecturer', status: 'package_fixed', institution_id,
    approval_chain: null, current_step: 0, submitted_at: '2026-10-01T00:00:00Z', final_decided_at: null,
    expected_joining_date: null, actual_joining_date: null, offer_issued_at: null, job_id,
  });
  const jobCreatorOf = new Map<string, string | null>([
    ['job-ok', 'creator-ok'],
    ['job-gone', 'creator-gone'],
    ['job-no-edit', 'creator-no-edit'],
    ['job-none', null],
  ]);

  it('keeps an unavailable college\'s candidate whose job creator can act; holds back the ones that fall back to HR editors', () => {
    const candidates = [
      cand('creator-can-act', 'college-bad', 'job-ok'),
      cand('creator-inactive', 'college-bad', 'job-gone'),
      cand('creator-cannot-edit', 'college-bad', 'job-no-edit'),
      cand('no-creator', 'college-bad', 'job-none'),
      cand('no-job', 'college-bad', null),
      cand('other-college', 'college-ok', null),
    ];
    const kept = offerCandidatesToCheck(candidates, new Set(['college-bad']), jobCreatorOf, dir).map((c) => c.id);
    expect(kept).toEqual(['creator-can-act', 'other-college']);
  });

  it('with every lookup fine, nothing is held back', () => {
    const candidates = [cand('a', 'college-bad', null), cand('b', null, 'job-gone')];
    expect(offerCandidatesToCheck(candidates, new Set(), jobCreatorOf, dir)).toHaveLength(2);
  });
});
