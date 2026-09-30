// __tests__/campus-walk/director-digest.test.ts
// ============================================================================
// The Director's ONE morning summary (Director ruling, 30 Sep 2026): every job
// that reached 7 days late since the last summary, grouped by college — never
// one message per job, never twice in a day.
//
// Each block is a way this goes wrong quietly:
//   - two summaries on one day (a retried cron), or a job listed on two days;
//   - a missed morning drops the jobs it would have listed;
//   - a job fixed or paused before 8 am still reaches him;
//   - the summary writes task metadata and races the 08:00 ladder.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeLadderDb, filterValue, type LadderQuery } from './ladder-fake-db';

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

const createBellNotification = vi.fn();
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...args: unknown[]) => createBellNotification(...args),
}));

const DIRECTOR = '00000000-0000-4000-8000-00000000d1d1';
vi.mock('@/lib/services/director-desk/handover-chase-service', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    resolveDirectors: vi.fn(async () => ({ ids: [DIRECTOR], source: 'legacy_profile_role' })),
  };
});

import {
  buildDirectorDigest,
  istDateOf,
  directorDigestIdempotencyKey,
  runCampusWalkDirectorDigest,
  type DigestJob,
} from '@/lib/campus-walk/director-digest';

const PROJ = '00000000-0000-4000-8000-0000000000aa';
const ARTS = '00000000-0000-4000-8000-00000000a001';
const PHARM = '00000000-0000-4000-8000-00000000a002';

// 08:03 IST on 1 Oct 2026.
const NOW = new Date('2026-10-01T02:33:00.000Z');
const YESTERDAY_CUTOFF = '2026-09-30T02:33:00.000Z';

function job(over: Partial<DigestJob>): DigestJob {
  return {
    taskId: 't',
    title: 'Fan not working',
    place: null,
    dueDate: '2026-09-23',
    daysOverdue: 8,
    collegeName: 'JKKN College of Arts',
    ...over,
  };
}

function row(id: string, reachedAt: string | null, institutionId: string | null, extra: Record<string, any> = {}) {
  return {
    id,
    title: `Job ${id}`,
    due_date: '2026-09-23',
    metadata: {
      source: 'campus-walk',
      institution_id: institutionId,
      campus_walk_chase: { rungs_sent: reachedAt ? { reached_director: reachedAt } : {} },
      ...extra,
    },
  };
}

function world(opts: { todayExists?: boolean; previous?: any; rows: any[] }) {
  return (q: LadderQuery) => {
    if (q.table === 'notifications') {
      if (filterValue(q, 'eq', 'idempotency_key')) return { data: opts.todayExists ? { id: 'n-today' } : null };
      return { data: opts.previous ?? null };
    }
    if (q.table === 'projects') return { data: { id: PROJ } };
    if (q.table === 'project_tasks') return { data: opts.rows };
    if (q.table === 'institutions') {
      return {
        data: [
          { id: ARTS, name: 'JKKN College of Arts' },
          { id: PHARM, name: 'JKKN College of Pharmacy' },
        ],
      };
    }
    return { data: null };
  };
}

beforeEach(() => {
  createBellNotification.mockReset();
  createBellNotification.mockResolvedValue('notif-1');
});

describe('the IST day', () => {
  it('08:03 IST is the same calendar day', () => {
    expect(istDateOf(NOW)).toBe('2026-10-01');
  });
  it('late evening UTC is already the next day in India', () => {
    expect(istDateOf(new Date('2026-09-30T20:00:00.000Z'))).toBe('2026-10-01');
  });
  it('one key per IST day', () => {
    expect(directorDigestIdempotencyKey('2026-10-01')).toBe('campus-walk-director-digest:2026-10-01');
  });
});

describe('grouping by college', () => {
  it('colleges in name order, "College not recorded" last, latest jobs first', () => {
    const { title, body } = buildDirectorDigest(
      [
        job({ taskId: 'a', title: 'Fan not working', collegeName: 'JKKN College of Pharmacy', daysOverdue: 7 }),
        job({ taskId: 'b', title: 'Broken bench', collegeName: null, daysOverdue: 9 }),
        job({ taskId: 'c', title: 'Leaking tap', collegeName: 'JKKN College of Arts', daysOverdue: 7 }),
        job({ taskId: 'd', title: 'Lift stuck', collegeName: 'JKKN College of Arts', daysOverdue: 12, place: 'Main block' }),
      ],
      { earlierStillOpen: 0 }
    );
    const arts = body.indexOf('JKKN College of Arts (2)');
    const pharm = body.indexOf('JKKN College of Pharmacy (1)');
    const none = body.indexOf('College not recorded (1)');
    expect(arts).toBeGreaterThan(-1);
    expect(arts).toBeLessThan(pharm);
    expect(pharm).toBeLessThan(none);
    expect(body.indexOf('Lift stuck')).toBeLessThan(body.indexOf('Leaking tap'));
    expect(body).toContain('"Lift stuck" at Main block — 12 days past due (was due 23 Sep 2026)');
    expect(title).toBe('Morning summary: 4 campus jobs 7 days past due across 3 colleges');
  });

  it('says how many from earlier summaries are still open', () => {
    const { body } = buildDirectorDigest([job({})], { earlierStillOpen: 3 });
    expect(body).toContain('3 jobs from earlier summaries are also still open.');
  });

  it('a long list is cut short with a count, not dropped', () => {
    const jobs = Array.from({ length: 5 }, (_, i) => job({ taskId: `t${i}`, title: `Job ${i}` }));
    const { body } = buildDirectorDigest(jobs, { earlierStillOpen: 0, maxListed: 3 });
    expect(body).toContain('…and 2 more on the Campus Operations board.');
  });
});

describe('the morning run', () => {
  it('lists only jobs that reached him since the last summary, in ONE message', async () => {
    const { db, queries } = makeLadderDb(
      world({
        previous: { created_at: YESTERDAY_CUTOFF, metadata: { cutoff: YESTERDAY_CUTOFF } },
        rows: [
          row('new-1', '2026-10-01T02:30:00.000Z', ARTS),
          row('new-2', '2026-09-30T10:00:00.000Z', PHARM),
          row('old-1', '2026-09-29T02:30:00.000Z', ARTS),
          row('not-yet', null, ARTS),
        ],
      })
    );
    const res = await runCampusWalkDirectorDigest({ client: db, now: NOW });

    expect(res.outcome).toBe('sent');
    expect(res.jobs_listed).toBe(2);
    expect(res.earlier_still_open).toBe(1);
    expect(createBellNotification).toHaveBeenCalledTimes(1);

    const bell = createBellNotification.mock.calls[0][1];
    expect(bell.recipientIds).toEqual([DIRECTOR]);
    expect(bell.idempotencyKey).toBe('campus-walk-director-digest:2026-10-01');
    expect(bell.metadata.cutoff).toBe(NOW.toISOString());
    expect(bell.metadata.task_ids.sort()).toEqual(['new-1', 'new-2']);
    expect(bell.body).toContain('JKKN College of Arts (1)');
    expect(bell.body).toContain('JKKN College of Pharmacy (1)');
    expect(bell.body).not.toContain('Job old-1');
    expect(bell.body).not.toContain('Job not-yet');

    // It never writes to the tasks — the 08:00 ladder owns their metadata.
    expect(queries.some((q) => q.table === 'project_tasks' && q.op !== 'select')).toBe(false);
  });

  it('never twice in one day: today\'s summary already exists, so nothing is read or sent', async () => {
    const { db, queries } = makeLadderDb(world({ todayExists: true, rows: [row('x', NOW.toISOString(), ARTS)] }));
    const res = await runCampusWalkDirectorDigest({ client: db, now: NOW });
    expect(res.outcome).toBe('already_sent');
    expect(createBellNotification).not.toHaveBeenCalled();
    expect(queries.some((q) => q.table === 'project_tasks')).toBe(false);
  });

  it('a quiet morning sends nothing', async () => {
    const { db } = makeLadderDb(
      world({
        previous: { created_at: YESTERDAY_CUTOFF, metadata: { cutoff: YESTERDAY_CUTOFF } },
        rows: [row('old-1', '2026-09-29T02:30:00.000Z', ARTS)],
      })
    );
    const res = await runCampusWalkDirectorDigest({ client: db, now: NOW });
    expect(res.outcome).toBe('nothing_new');
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('a missed morning loses nothing: the next summary starts from the last one actually sent', async () => {
    const twoDaysAgo = '2026-09-29T02:33:00.000Z';
    const { db } = makeLadderDb(
      world({
        previous: { created_at: twoDaysAgo, metadata: { cutoff: twoDaysAgo } },
        rows: [row('missed', '2026-09-30T02:30:00.000Z', ARTS), row('today', '2026-10-01T02:30:00.000Z', ARTS)],
      })
    );
    const res = await runCampusWalkDirectorDigest({ client: db, now: NOW });
    expect(res.jobs_listed).toBe(2);
  });

  it('a marker stamped just before yesterday\'s cutoff but written after it is listed once, not lost', async () => {
    const { db } = makeLadderDb(
      world({
        previous: {
          created_at: YESTERDAY_CUTOFF,
          metadata: { cutoff: YESTERDAY_CUTOFF, task_ids: ['listed-yesterday'] },
        },
        rows: [
          // Ladder started 08:02:30 IST yesterday and wrote after the 08:03 summary read.
          row('late-write', '2026-09-30T02:32:30.000Z', ARTS),
          // Same stamp window, but yesterday's summary did list it.
          row('listed-yesterday', '2026-09-30T02:32:30.000Z', ARTS),
        ],
      })
    );
    const res = await runCampusWalkDirectorDigest({ client: db, now: NOW });
    expect(res.jobs_listed).toBe(1);
    expect(res.earlier_still_open).toBe(1);
    expect(createBellNotification.mock.calls[0][1].metadata.task_ids).toEqual(['late-write']);
  });

  it('the first summary ever lists every job that has reached him', async () => {
    const { db } = makeLadderDb(world({ rows: [row('a', '2026-09-20T02:30:00.000Z', null)] }));
    const res = await runCampusWalkDirectorDigest({ client: db, now: NOW });
    expect(res.outcome).toBe('sent');
    expect(createBellNotification.mock.calls[0][1].body).toContain('College not recorded (1)');
  });

  it('paused and closed jobs are left out by the query', async () => {
    const { db, queries } = makeLadderDb(world({ rows: [] }));
    await runCampusWalkDirectorDigest({ client: db, now: NOW });
    const q = queries.find((x) => x.table === 'project_tasks')!;
    expect(filterValue(q, 'eq', 'is_blocked')).toBe(false);
    expect(String(filterValue(q, 'not', 'status_key'))).toContain('done');
  });
});
