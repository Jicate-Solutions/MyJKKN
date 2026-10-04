// __tests__/campus-walk/closure.test.ts
// ============================================================================
// lib/campus-walk/closure.ts — the ONE place a Campus Walk job becomes 'done'.
//
// Director's ruling, 2026-09-30: the fixer's photo closes the job at once, and
// the reporter is told "fixed". Each assertion below is a way this could go
// wrong quietly:
//   - the approval record is not written as 'approved' -> the scoreboard's
//     verified-closure rule (done + approved) stops counting photo closures;
//   - the write is not a compare-and-set -> a retried request re-stamps the
//     closure and rings every bell again;
//   - the reporter key is per task, not per photo -> a job reopened with
//     "Not fixed" and fixed again never tells the reporter the second time;
//   - the fixer is rung about their own closure -> noise on every job.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeDb, filterOf, type RecordedQuery } from './fake-db';

const createBellNotification = vi.fn();
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...args: unknown[]) => createBellNotification(...args),
}));

import {
  closeCampusWalkTask,
  reporterFixedIdempotencyKey,
  reporterProfileIdOf,
} from '@/lib/campus-walk/closure';

function task(extra: Record<string, any> = {}, status = 'review') {
  return {
    id: 'task-1',
    title: 'Block A washroom — the tap will not turn off',
    status_key: status,
    owner_staff_id: 'acc-staff-1',
    completed_at: null,
    metadata: {
      source: 'campus-walk',
      front_door: 'instasolver',
      reporter_id: 'learner-1',
      raised_by_profile_id: 'learner-1',
      fix: {
        submitted_at: '2026-09-30T08:00:00.000Z',
        submitted_by_profile_id: 'fixer-1',
        attachment_id: 'att-9',
        storage_path: 'task-1/fix/abc.jpg',
        approval: { state: 'awaiting_approval', note: null },
      },
      ...extra,
    },
  };
}

/** Default: the compare-and-set update lands one row; lookups find nothing. */
function defaultRespond(q: RecordedQuery) {
  if (q.table === 'project_tasks' && q.op === 'update') return { data: [{ id: 'task-1' }] };
  return { data: null };
}

function closeUpdate(queries: RecordedQuery[]) {
  return queries.find((q) => q.table === 'project_tasks' && q.op === 'update');
}

function bellTo(category: string) {
  return createBellNotification.mock.calls.find((c) => (c[1] as any)?.category === category);
}

beforeEach(() => {
  vi.clearAllMocks();
  createBellNotification.mockResolvedValue('notif-1');
});

describe('closeCampusWalkTask — the photo closes the job', () => {
  it('writes done + completed_at + an approved, auto record under a compare-and-set', async () => {
    const { db, queries } = makeFakeDb(defaultRespond);
    const now = new Date('2026-09-30T09:00:00.000Z');

    const res = await closeCampusWalkTask(db as any, task(), {
      decidedByProfileId: 'fixer-1',
      auto: true,
      now,
    });

    expect(res.ok).toBe(true);
    const upd = closeUpdate(queries)!;
    expect(upd.payload.status_key).toBe('done');
    expect(upd.payload.completed_at).toBe(now.toISOString());
    expect(upd.payload.metadata.fix.approval).toMatchObject({
      state: 'approved',
      auto: true,
      decided_by_profile_id: 'fixer-1',
      previous_state: 'awaiting_approval',
    });
    // Compare-and-set on the status the caller read.
    expect(filterOf(upd, 'id')).toBe('task-1');
    expect(filterOf(upd, 'status_key')).toBe('review');
  });

  it('does not ring the fixer about their own closure, but tells the reporter', async () => {
    const { db } = makeFakeDb(defaultRespond);

    const res = await closeCampusWalkTask(db as any, task(), { decidedByProfileId: 'fixer-1', auto: true });

    expect(bellTo('campus-walk:approved')).toBeUndefined();
    const reporter = bellTo('instasolver:reported-fixed');
    expect(reporter).toBeDefined();
    const opts = reporter![1] as any;
    expect(opts.recipientIds).toEqual(['learner-1']);
    expect(opts.createdBy).toBe('learner-1');
    expect(opts.url).toBe('/instasolver/my-reports');
    expect(opts.idempotencyKey).toBe('instasolver-fixed:task-1:att-9');
    expect(opts.body).toContain('Not fixed');
    expect(`${opts.title} ${opts.body}`).not.toContain('fixer-1');
    expect(res.ok && res.reporterNotified).toBe(true);
    expect(res.ok && res.fixerNotified).toBeNull();
  });

  it('rings the fixer when a manager approves an old queue row', async () => {
    const { db } = makeFakeDb(defaultRespond);

    await closeCampusWalkTask(db as any, task(), {
      decidedByProfileId: 'manager-1',
      auto: false,
      note: 'Looks good',
    });

    const fixer = bellTo('campus-walk:approved');
    expect(fixer).toBeDefined();
    expect((fixer![1] as any).recipientIds).toEqual(['fixer-1']);
    expect((fixer![1] as any).createdBy).toBe('fixer-1');
  });

  it('tells whoever raised a walk job when there is no InstaSolver reporter', async () => {
    const { db } = makeFakeDb(defaultRespond);
    const t = task({ reporter_id: undefined, front_door: undefined, raised_by_profile_id: 'walker-1' });

    await closeCampusWalkTask(db as any, t, { decidedByProfileId: 'fixer-1', auto: true });

    expect((bellTo('instasolver:reported-fixed')![1] as any).recipientIds).toEqual(['walker-1']);
  });

  it('skips the reporter bell when the reporter is the one who fixed it', async () => {
    const { db } = makeFakeDb(defaultRespond);
    const t = task({ reporter_id: 'fixer-1', raised_by_profile_id: 'fixer-1' });

    const res = await closeCampusWalkTask(db as any, t, { decidedByProfileId: 'fixer-1', auto: true });

    expect(bellTo('instasolver:reported-fixed')).toBeUndefined();
    expect(res.ok && res.reporterNotified).toBeNull();
  });

  it('reports an earlier closure as already done and rings nothing', async () => {
    const { db } = makeFakeDb((q) => {
      if (q.table === 'project_tasks' && q.op === 'update') return { data: [] };
      if (q.table === 'project_tasks' && q.terminal === 'maybeSingle') {
        return {
          data: {
            status_key: 'done',
            completed_at: '2026-09-30T08:59:00.000Z',
            metadata: { fix: { approval: { state: 'approved' } } },
          },
        };
      }
      return { data: null };
    });

    const res = await closeCampusWalkTask(db as any, task(), { decidedByProfileId: 'fixer-1', auto: true });

    expect(res).toMatchObject({ ok: true, already: true, statusKey: 'done' });
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('refuses a raced write that did not end up closed', async () => {
    const { db } = makeFakeDb((q) => {
      if (q.table === 'project_tasks' && q.op === 'update') return { data: [] };
      if (q.table === 'project_tasks' && q.terminal === 'maybeSingle') {
        return { data: { status_key: 'cancelled', metadata: {} } };
      }
      return { data: null };
    });

    const res = await closeCampusWalkTask(db as any, task(), { decidedByProfileId: 'fixer-1', auto: true });

    expect(res).toMatchObject({ ok: false, code: 'raced' });
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('refuses to close a job with no fix photo on record', async () => {
    const { db, queries } = makeFakeDb(defaultRespond);
    const t = task();
    delete (t.metadata as any).fix;

    const res = await closeCampusWalkTask(db as any, t, { decidedByProfileId: 'x', auto: true });

    expect(res).toMatchObject({ ok: false, code: 'nothing_submitted' });
    expect(closeUpdate(queries)).toBeUndefined();
  });
});

describe('the helpers', () => {
  it('keys the reporter bell per photo, with fallbacks for old rows', () => {
    expect(reporterFixedIdempotencyKey('t', { fix: { attachment_id: 'a1' } })).toBe('instasolver-fixed:t:a1');
    expect(reporterFixedIdempotencyKey('t', { fix: { storage_path: 't/fix/x.jpg' } })).toBe(
      'instasolver-fixed:t:t/fix/x.jpg'
    );
    expect(reporterFixedIdempotencyKey('t', {})).toBe('instasolver-fixed:t:legacy');
  });

  it('prefers the InstaSolver reporter, then whoever raised it', () => {
    expect(reporterProfileIdOf({ reporter_id: 'a', raised_by_profile_id: 'b' })).toBe('a');
    expect(reporterProfileIdOf({ raised_by_profile_id: 'b' })).toBe('b');
    expect(reporterProfileIdOf({})).toBeNull();
    expect(reporterProfileIdOf(null)).toBeNull();
  });
});
