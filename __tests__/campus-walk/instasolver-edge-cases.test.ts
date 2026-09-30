// __tests__/campus-walk/instasolver-edge-cases.test.ts
// ============================================================================
// The four InstaSolver edge cases the Director ruled on in the 2026-09-30
// interview. Each block pins the way that ruling could break silently:
//
//   (1) the SECOND reporter "Not fixed" tells the college head — the first
//       does not, and a spot checker's own "Not fixed" never counts;
//   (2) a report joins an open job only on the same college + same place +
//       similar words + open + recent — a wrong join hides a report;
//   (3) 1 in 10 photo closures is picked, deterministically per task, written
//       in the SAME update as the closure; only the right checker may decide;
//   (4) no owner -> caretaker -> estate office (EAO) -> principal.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeDb, filterOf, type RecordedQuery } from './fake-db';

const createBellNotification = vi.fn();
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...args: unknown[]) => createBellNotification(...args),
}));

const principalsByInstitution = vi.fn();
vi.mock('@/lib/services/academic/intake-readiness-alarm', () => ({
  resolvePrincipalsByInstitution: (...args: unknown[]) => principalsByInstitution(...args),
}));

const resolveDirectors = vi.fn();
vi.mock('@/lib/services/director-desk/handover-chase-service', () => ({
  resolveDirectors: (...args: unknown[]) => resolveDirectors(...args),
  validateTargeting: (ids: string[]) =>
    ids.length > 0 ? { ok: true, userIds: ids } : { ok: false, userIds: [], reason: 'empty recipient list' },
}));

const isCampusWalkReporter = vi.fn();
vi.mock('@/lib/campus-walk/reporters', () => ({
  isCampusWalkReporter: (...args: unknown[]) => isCampusWalkReporter(...args),
}));

const getUser = vi.fn();
let fake: ReturnType<typeof makeFakeDb>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceRoleClient: () => fake.db,
}));

import {
  describeOverlap,
  findOpenReportToJoin,
  normaliseLocation,
  sharesEnoughWords,
  JOIN_MIN_OVERLAP,
  type OpenReportCandidate,
} from '@/lib/campus-walk/duplicates';
import {
  SPOT_CHECK_ONE_IN,
  isSpotCheckPick,
  rollSpotCheck,
  spotCheckerFor,
  viewerMayCheck,
  type SpotCheck,
} from '@/lib/campus-walk/spot-check';
import { reopenCampusWalkTask, reporterNotFixedCount } from '@/lib/campus-walk/reopen';
import { closeCampusWalkTask } from '@/lib/campus-walk/closure';
import {
  joinedReportPhotoPaths,
  joinedReporterIdsOf,
  mergeJoinedReports,
  reportStatusOf,
} from '@/lib/campus-walk/my-reports';
import { routeAccountable } from '@/lib/services/campus-walk/campus-walk-service';

const DAY = 86_400_000;

/** The 1-in-10 die, fixed: always picked / never picked. */
const PICK = () => true;
const NO_PICK = () => false;

function bellsIn(category: string) {
  return createBellNotification.mock.calls.filter((c) => (c[1] as any)?.category === category);
}

function updates(): RecordedQuery[] {
  return fake.queries.filter((q) => q.table === 'project_tasks' && q.op === 'update');
}

/** Default database: updates land, the Accountable resolves, lookups are empty. */
function respond(q: RecordedQuery) {
  if (q.table === 'project_tasks' && q.op === 'update') return { data: [{ id: 'x' }] };
  if (q.table === 'project_task_assignees') return { data: { staff_id: 'acc-staff-1' } };
  if (q.table === 'staff' && q.terminal === 'maybeSingle') return { data: { profile_id: 'accountable-1' } };
  return { data: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeDb(respond);
  createBellNotification.mockResolvedValue('notif-1');
  principalsByInstitution.mockResolvedValue(new Map([['inst-1', ['principal-1']]]));
  resolveDirectors.mockResolvedValue({ ids: ['director-1'], source: 'director' });
  isCampusWalkReporter.mockResolvedValue(false);
});

// ── (2) the join matcher ────────────────────────────────────────────────────

describe('ruling 2 — which open report a new one joins', () => {
  const now = Date.parse('2026-10-01T10:00:00Z');
  const base: OpenReportCandidate = {
    taskId: 'open-1',
    institutionId: 'inst-1',
    location: 'Block A, second floor washroom',
    description: 'The tap is leaking all day',
    statusKey: 'todo',
    createdAt: new Date(now - 2 * DAY).toISOString(),
  };
  const ask = (over: Partial<Parameters<typeof findOpenReportToJoin>[0]> = {}, candidates = [base]) =>
    findOpenReportToJoin({
      institutionId: 'inst-1',
      location: 'second floor washroom, block A',
      description: 'tap leaking',
      candidates,
      now,
      ...over,
    });

  it('joins the same fault at the same place, whatever the word order', () => {
    expect(normaliseLocation('Block A, second floor washroom')).toBe(normaliseLocation('second floor washroom — block a'));
    expect(ask()).toEqual({ taskId: 'open-1', overlap: 1 });
  });

  it('keeps a different room apart, even with the same words', () => {
    expect(ask({ location: 'Block A, third floor washroom' })).toBeNull();
  });

  it('keeps a different fault in the same room apart', () => {
    expect(describeOverlap('fan broken', 'light broken')).toBeLessThan(JOIN_MIN_OVERLAP);
    expect(ask({ description: 'the light is broken' }, [{ ...base, description: 'fan broken' }])).toBeNull();
  });

  it('needs two shared words, not one — a single common word never decides (repair round)', () => {
    // Both reviewers' examples: one shared word scored 1.00 and joined.
    expect(sharesEnoughWords('AC not working', 'AC leaking water')).toBe(false);
    expect(sharesEnoughWords('Light not working', 'Light switch gives electric shock')).toBe(false);
    expect(sharesEnoughWords('Fan not working', 'Fan making loud noise and sparks')).toBe(false);
    expect(sharesEnoughWords('Broken', 'Broken chair')).toBe(false);
    expect(ask({ description: 'AC not working' }, [{ ...base, description: 'AC leaking water' }])).toBeNull();
    // Still joins the same fault said twice.
    expect(sharesEnoughWords('Light not working', 'light not working properly')).toBe(true);
    expect(sharesEnoughWords('tap leaking', 'The tap is leaking all day')).toBe(true);
  });

  it('never joins a closed, cancelled or archived job — a recurrence is a new report', () => {
    for (const statusKey of ['done', 'cancelled', 'archived']) {
      expect(ask({}, [{ ...base, statusKey }])).toBeNull();
    }
  });

  it('never joins another college’s job, or one older than 14 days', () => {
    expect(ask({}, [{ ...base, institutionId: 'inst-2' }])).toBeNull();
    expect(ask({}, [{ ...base, createdAt: new Date(now - 15 * DAY).toISOString() }])).toBeNull();
  });

  it('never joins anything for a reporter with no college on record', () => {
    expect(ask({ institutionId: null })).toBeNull();
  });

  it('prefers the most similar job, then the most recent', () => {
    const older = { ...base, taskId: 'older', createdAt: new Date(now - 5 * DAY).toISOString() };
    const newer = { ...base, taskId: 'newer', createdAt: new Date(now - 1 * DAY).toISOString() };
    expect(ask({}, [older, newer])?.taskId).toBe('newer');
  });
});

describe('ruling 2 — writing the join', () => {
  const openJob = {
    id: 'open-1',
    title: 'Block A washroom — tap leaking',
    status_key: 'todo',
    owner_staff_id: 'st-owner',
    due_date: '2026-10-03',
    metadata: { source: 'campus-walk', additional_reports: [{ reporter_id: 'first-joiner' }] },
  };
  const entry = {
    reporter_id: 'learner-2',
    raised_by_profile_id: 'learner-2',
    reporter_role: null,
    note: 'tap leaking',
    photo_storage_path: null,
    at: '2026-10-01T10:00:00Z',
  };

  it('appends to additional_reports only while the job is still open, and tells the owner', async () => {
    const { joinOpenReport } = await import('@/lib/campus-walk/join-report');
    const res = await joinOpenReport(fake.db as any, openJob, entry, 'owner-1');
    expect(res.ok).toBe(true);
    const upd = updates()[0];
    expect(filterOf(upd, 'status_key')).toBe('todo');
    expect(upd.payload.metadata.additional_reports.map((r: any) => r.reporter_id)).toEqual([
      'first-joiner',
      'learner-2',
    ]);
    const [bell] = bellsIn('instasolver:report-joined');
    expect((bell[1] as any).recipientIds).toEqual(['owner-1']);
    expect(`${(bell[1] as any).title} ${(bell[1] as any).body}`).not.toContain('learner-2');
  });

  it('reports "not joined" when the job closed in the meantime, so a new one is filed', async () => {
    fake = makeFakeDb((q) => (q.table === 'project_tasks' && q.op === 'update' ? { data: [] } : { data: null }));
    const { joinOpenReport } = await import('@/lib/campus-walk/join-report');
    const res = await joinOpenReport(fake.db as any, openJob, entry, 'owner-1');
    expect(res.ok).toBe(false);
    expect(bellsIn('instasolver:report-joined')).toHaveLength(0);
  });

  it('two people joining at once both land: the second re-reads and appends to what the first wrote', async () => {
    let first = true;
    fake = makeFakeDb((q) => {
      if (q.table === 'project_tasks' && q.op === 'update') {
        if (first) {
          first = false;
          return { data: [] }; // another joiner got in first: updated_at moved
        }
        return { data: [{ id: 'open-1' }] };
      }
      if (q.table === 'project_tasks' && q.op === 'select') {
        return {
          data: {
            status_key: 'in_progress',
            updated_at: 'v2',
            metadata: {
              source: 'campus-walk',
              additional_reports: [{ reporter_id: 'first-joiner' }, { reporter_id: 'racing-joiner' }],
            },
          },
        };
      }
      return { data: null };
    });
    const { joinOpenReport } = await import('@/lib/campus-walk/join-report');
    const res = await joinOpenReport(fake.db as any, { ...openJob, updated_at: 'v1' }, entry, 'owner-1');
    expect(res.ok).toBe(true);
    const [miss, landed] = updates();
    expect(filterOf(miss, 'updated_at')).toBe('v1');
    expect(filterOf(landed, 'updated_at')).toBe('v2');
    expect(filterOf(landed, 'status_key')).toBe('in_progress');
    expect(landed.payload.metadata.additional_reports.map((r: any) => r.reporter_id)).toEqual([
      'first-joiner',
      'racing-joiner',
      'learner-2',
    ]);
    expect(bellsIn('instasolver:report-joined')).toHaveLength(1);
  });

  it('does not join a job that was closed while it retried', async () => {
    fake = makeFakeDb((q) => {
      if (q.table === 'project_tasks' && q.op === 'update') return { data: [] };
      if (q.table === 'project_tasks' && q.op === 'select') {
        return { data: { status_key: 'done', updated_at: 'v2', metadata: {} } };
      }
      return { data: null };
    });
    const { joinOpenReport } = await import('@/lib/campus-walk/join-report');
    const res = await joinOpenReport(fake.db as any, { ...openJob, updated_at: 'v1' }, entry, 'owner-1');
    expect(res.ok).toBe(false);
    expect(updates()).toHaveLength(1);
  });
});

describe('joined reports survive a whole-metadata write, and their photos purge', () => {
  it('puts back joins that landed after the read, once each, keeping our own fields', () => {
    const mine = { fix: { note: 'done' }, additional_reports: [{ reporter_id: 'a', at: '1' }] };
    const fresh = { additional_reports: [{ reporter_id: 'a', at: '1' }, { reporter_id: 'b', at: '2' }] };
    const merged = mergeJoinedReports(mine, fresh);
    expect(merged.additional_reports.map((r: any) => r.reporter_id)).toEqual(['a', 'b']);
    expect(merged.fix).toEqual({ note: 'done' });
    expect(mergeJoinedReports(mine, {})).toBe(mine);
  });

  it('lists the joined reports’ photos for the retention purge', () => {
    expect(
      joinedReportPhotoPaths({
        additional_reports: [
          { photo_storage_path: 'u/1.jpg' },
          { photo_storage_path: null },
          { photo_storage_path: 'u/1.jpg' },
          { photo_storage_path: 'u/2.jpg' },
        ],
      })
    ).toEqual(['u/1.jpg', 'u/2.jpg']);
  });
});

describe('ruling 2 — joined reporters are counted once and shown', () => {
  it('reads every joined reporter once, in order', () => {
    expect(
      joinedReporterIdsOf({
        additional_reports: [{ reporter_id: 'a' }, { reporter_id: 'b' }, { reporter_id: 'a' }, { note: 'x' }],
      })
    ).toEqual(['a', 'b']);
    expect(joinedReporterIdsOf({})).toEqual([]);
  });
});

// ── (3) the fake-fix guard ──────────────────────────────────────────────────

describe('ruling 3 — which closures are spot checked', () => {
  it('rolls about 1 in 10, at random — not from the task id the fixer can see', () => {
    let picked = 0;
    for (let i = 0; i < 5000; i++) if (rollSpotCheck()) picked++;
    expect(picked / 5000).toBeGreaterThan(1 / SPOT_CHECK_ONE_IN - 0.02);
    expect(picked / 5000).toBeLessThan(1 / SPOT_CHECK_ONE_IN + 0.02);
    // The same metadata is not a fixed answer: both outcomes show up.
    const outcomes = new Set(Array.from({ length: 200 }, () => isSpotCheckPick({ source: 'campus-walk' })));
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('always looks again at a job whose last spot check failed', () => {
    expect(isSpotCheckPick({ spot_check: { state: 'failed' } }, NO_PICK)).toBe(true);
    expect(isSpotCheckPick({ spot_check: { state: 'passed' } }, NO_PICK)).toBe(false);
  });

  it('sends InstaSolver jobs to the college head and the Director’s own walk jobs to him', () => {
    expect(spotCheckerFor({ front_door: 'instasolver', institution_id: 'inst-1' })).toBe('college_head');
    expect(spotCheckerFor({ institution_id: 'inst-1' })).toBe('director');
    // No college on record -> no college head -> the Director, never nobody.
    expect(spotCheckerFor({ front_door: 'instasolver' })).toBe('director');
  });

  it('lets only the right person decide', () => {
    const head: SpotCheck = { state: 'pending', checker: 'college_head', institution_id: 'inst-1', picked_at: 'x' };
    const dir: SpotCheck = { ...head, checker: 'director', institution_id: null };
    const principal = { profileId: 'p', isDirector: false, headOfInstitutionIds: ['inst-1'] };
    const otherPrincipal = { profileId: 'q', isDirector: false, headOfInstitutionIds: ['inst-2'] };
    const director = { profileId: 'd', isDirector: true, headOfInstitutionIds: [] };
    expect(viewerMayCheck(principal, head)).toBe(true);
    expect(viewerMayCheck(otherPrincipal, head)).toBe(false);
    expect(viewerMayCheck(director, head)).toBe(false);
    expect(viewerMayCheck(director, dir)).toBe(true);
    expect(viewerMayCheck(principal, dir)).toBe(false);
  });

  it('never lets the person who sent the fix photo decide — on the check or on the job', () => {
    const head: SpotCheck = {
      state: 'pending',
      checker: 'college_head',
      institution_id: 'inst-1',
      picked_at: 'x',
      fixer_profile_id: 'p',
    };
    const principal = { profileId: 'p', isDirector: true, headOfInstitutionIds: ['inst-1'] };
    expect(viewerMayCheck(principal, head)).toBe(false);
    expect(viewerMayCheck(principal, { ...head, checker: 'director', institution_id: null })).toBe(false);
    // An older check without fixer_profile_id falls back to the job's own fix record.
    const { fixer_profile_id: _drop, ...old } = head;
    expect(viewerMayCheck(principal, old, { fix: { submitted_by_profile_id: 'p' } })).toBe(false);
    expect(viewerMayCheck(principal, old, { fix: { submitted_by_profile_id: 'someone-else' } })).toBe(true);
  });
});

function fixedTask(id: string, extra: Record<string, any> = {}, status = 'review') {
  return {
    id,
    title: 'Block A washroom — the tap will not turn off',
    status_key: status,
    owner_staff_id: 'acc-staff-1',
    completed_at: null as string | null,
    metadata: {
      source: 'campus-walk',
      front_door: 'instasolver',
      institution_id: 'inst-1',
      kind: 'symptom',
      reporter_id: 'learner-1',
      raised_by_profile_id: 'learner-1',
      fix: {
        submitted_by_profile_id: 'fixer-1',
        attachment_id: 'att-9',
        storage_path: 'x/fix.jpg',
        approval: { state: 'awaiting_approval' },
      },
      ...extra,
    } as Record<string, any>,
  };
}

describe('ruling 3 — the pick is written with the closure', () => {
  it('writes a pending spot check in the SAME update that closes a picked job, and bells the college head', async () => {
    const res = await closeCampusWalkTask(fake.db as any, fixedTask('task-1'), {
      decidedByProfileId: 'fixer-1',
      auto: true,
      spotCheckRoll: PICK,
    });

    expect(res.ok).toBe(true);
    expect(updates()).toHaveLength(1);
    const upd = updates()[0];
    expect(upd.payload.status_key).toBe('done');
    expect(upd.payload.metadata.spot_check).toMatchObject({
      state: 'pending',
      checker: 'college_head',
      institution_id: 'inst-1',
      fixer_profile_id: 'fixer-1',
    });
    const bell = bellsIn('campus-walk:spot-check');
    expect(bell).toHaveLength(1);
    expect((bell[0][1] as any).recipientIds).toEqual(['principal-1']);
    expect((bell[0][1] as any).url).toBe('/campus-walk/spot-checks');
  });

  it('bells the Director for a job he raised on his walk', async () => {
    await closeCampusWalkTask(fake.db as any, fixedTask('task-1', { front_door: undefined }), {
      decidedByProfileId: 'fixer-1',
      auto: true,
      spotCheckRoll: PICK,
    });
    expect(updates()[0].payload.metadata.spot_check.checker).toBe('director');
    expect((bellsIn('campus-walk:spot-check')[0][1] as any).recipientIds).toEqual(['director-1']);
  });

  it('never picks an unpicked job, and never a manager’s approval', async () => {
    await closeCampusWalkTask(fake.db as any, fixedTask('task-1'), {
      decidedByProfileId: 'fixer-1',
      auto: true,
      spotCheckRoll: NO_PICK,
    });
    await closeCampusWalkTask(fake.db as any, fixedTask('task-2'), {
      decidedByProfileId: 'manager-1',
      auto: false,
      spotCheckRoll: PICK,
    });
    for (const u of updates()) expect(u.payload.metadata.spot_check).toBeUndefined();
    expect(bellsIn('campus-walk:spot-check')).toHaveLength(0);
  });

  it('tells everyone who joined the report that it is fixed — once, not the reporter twice', async () => {
    await closeCampusWalkTask(
      fake.db as any,
      fixedTask('task-1', {
        additional_reports: [{ reporter_id: 'joiner-1' }, { reporter_id: 'learner-1' }, { reporter_id: 'joiner-2' }],
      }),
      { decidedByProfileId: 'fixer-1', auto: true, spotCheckRoll: NO_PICK }
    );
    const bells = bellsIn('instasolver:reported-fixed');
    expect(bells).toHaveLength(2);
    const joined = bells.find((c) => (c[1] as any).metadata?.joined === true)![1] as any;
    expect(joined.recipientIds).toEqual(['joiner-1', 'joiner-2']);
    expect(joined.idempotencyKey).toMatch(/:joined$/);
  });

  it('never asks the fixer to check their own work: a principal who fixed it passes the check up to the Director', async () => {
    const res = await closeCampusWalkTask(
      fake.db as any,
      fixedTask('task-1', { fix: { submitted_by_profile_id: 'principal-1', attachment_id: 'att-9', approval: {} } }),
      { decidedByProfileId: 'principal-1', auto: true, spotCheckRoll: PICK }
    );
    expect(res.ok).toBe(true);
    expect(updates()[0].payload.metadata.spot_check).toMatchObject({
      checker: 'director',
      institution_id: null,
      fixer_profile_id: 'principal-1',
      escalated_from_fixer: true,
    });
    const [bell] = bellsIn('campus-walk:spot-check');
    expect((bell[1] as any).recipientIds).toEqual(['director-1']);
  });

  it('bells the Director list that also gates the buttons (resolveDirectors), minus the fixer', async () => {
    resolveDirectors.mockResolvedValue({ ids: ['director-1', 'fixer-1'], source: 'director' });
    await closeCampusWalkTask(fake.db as any, fixedTask('task-1', { front_door: undefined }), {
      decidedByProfileId: 'fixer-1',
      auto: true,
      spotCheckRoll: PICK,
    });
    expect((bellsIn('campus-walk:spot-check')[0][1] as any).recipientIds).toEqual(['director-1']);
  });

  it('keeps a report that joined between the read and the close, and tells that person', async () => {
    let missed = false;
    fake = makeFakeDb((q) => {
      if (q.table === 'project_tasks' && q.op === 'update') {
        if (!missed) {
          missed = true;
          return { data: [] }; // a join landed: updated_at moved
        }
        return { data: [{ id: 'task-1', updated_at: 'v3' }] };
      }
      if (q.table === 'project_tasks' && q.op === 'select') {
        return {
          data: {
            status_key: 'review',
            updated_at: 'v2',
            metadata: { additional_reports: [{ reporter_id: 'late-joiner', at: 't1' }] },
          },
        };
      }
      return respond(q);
    });
    const res = await closeCampusWalkTask(
      fake.db as any,
      { ...fixedTask('task-1'), updated_at: 'v1' },
      { decidedByProfileId: 'fixer-1', auto: true, spotCheckRoll: NO_PICK }
    );
    expect(res.ok).toBe(true);
    const [first, second] = updates();
    expect(filterOf(first, 'updated_at')).toBe('v1');
    expect(filterOf(second, 'updated_at')).toBe('v2');
    expect(filterOf(second, 'status_key')).toBe('review');
    expect(second.payload.metadata.additional_reports.map((r: any) => r.reporter_id)).toEqual(['late-joiner']);
    expect(second.payload.metadata.fix.approval.state).toBe('approved');
    const joined = bellsIn('instasolver:reported-fixed').find((c) => (c[1] as any).metadata?.joined === true)!;
    expect((joined[1] as any).recipientIds).toEqual(['late-joiner']);
  });
});

// ── (1) and the shared reopen ───────────────────────────────────────────────

function closedTask(extra: Record<string, any> = {}) {
  const t = fixedTask('task-7', extra, 'done');
  t.completed_at = new Date(Date.now() - DAY).toISOString();
  t.metadata.fix.approval = { state: 'approved', auto: true };
  return t;
}

describe('ruling 1 — the second "Not fixed" tells the college head', () => {
  it('does not tell the head on the first reporter "Not fixed"', async () => {
    const res = await reopenCampusWalkTask(fake.db as any, closedTask(), { byProfileId: 'learner-1', via: 'reporter' });
    expect(res.ok && res.notFixedCount).toBe(1);
    expect(res.ok && res.headNotified).toBeNull();
    expect(bellsIn('campus-walk:failed-twice')).toHaveLength(0);
    expect(updates()[0].payload.metadata.not_fixed_count).toBe(1);
  });

  it('tells the principal of the job’s college on the second', async () => {
    const res = await reopenCampusWalkTask(fake.db as any, closedTask({ not_fixed_count: 1 }), {
      byProfileId: 'learner-1',
      via: 'reporter',
      doNotTell: ['learner-1'],
    });
    expect(res.ok && res.notFixedCount).toBe(2);
    expect(res.ok && res.headNotified).toBe(true);
    const [bell] = bellsIn('campus-walk:failed-twice');
    expect((bell[1] as any).recipientIds).toEqual(['principal-1']);
    expect((bell[1] as any).idempotencyKey).toBe('campus-walk-failed-again:task-7:n2');
    expect((bell[1] as any).url).toBe('/campus-walk/spot-checks');
    expect(principalsByInstitution).toHaveBeenCalledWith(expect.anything(), ['inst-1']);
  });

  it('counts reopens made before the counter existed', () => {
    expect(reporterNotFixedCount({ reopens: [{ at: 'x' }] })).toBe(1);
    expect(reporterNotFixedCount({ reopens: [{ via: 'spot_check' }, { via: 'reporter' }] })).toBe(1);
  });

  it('says so, not silently, when the college has no head on record', async () => {
    principalsByInstitution.mockResolvedValue(new Map([['inst-1', []]]));
    const res = await reopenCampusWalkTask(fake.db as any, closedTask({ not_fixed_count: 1 }), {
      byProfileId: 'learner-1',
      via: 'reporter',
    });
    expect(res.ok && res.headNotified).toBe(false);
  });

  it('a spot checker’s "Not fixed" reopens the same way but is not counted, and fails the check', async () => {
    const res = await reopenCampusWalkTask(
      fake.db as any,
      closedTask({
        not_fixed_count: 1,
        spot_check: { state: 'pending', checker: 'college_head', institution_id: 'inst-1', picked_at: 'x' },
      }),
      { byProfileId: 'principal-1', via: 'spot_check', note: 'Still cracked' }
    );
    expect(res.ok && res.notFixedCount).toBe(1);
    expect(bellsIn('campus-walk:failed-twice')).toHaveLength(0);
    const upd = updates()[0];
    expect(filterOf(upd, 'status_key')).toBe('done');
    expect(upd.payload.status_key).toBe('in_progress');
    expect(upd.payload.metadata.spot_check).toMatchObject({ state: 'failed', decided_by_profile_id: 'principal-1' });
    expect(upd.payload.metadata.fix.approval.reopened_by_spot_check).toBe(true);
    expect(reportStatusOf({ status_key: 'in_progress', metadata: upd.payload.metadata })).toBe('reopened');
    const [fixerBell] = bellsIn('campus-walk:not-fixed');
    expect((fixerBell[1] as any).body).toMatch(/A spot check found/);
    expect((fixerBell[1] as any).body).not.toMatch(/principal-1/);
  });

  it('a reporter reopening a job awaiting its spot check marks the check superseded', async () => {
    await reopenCampusWalkTask(
      fake.db as any,
      closedTask({ spot_check: { state: 'pending', checker: 'college_head', institution_id: 'inst-1', picked_at: 'x' } }),
      { byProfileId: 'learner-1', via: 'reporter' }
    );
    expect(updates()[0].payload.metadata.spot_check.state).toBe('superseded');
  });
});

// ── the spot-check route ────────────────────────────────────────────────────

describe('app/api/campus-walk/spot-check — the checker’s two buttons', () => {
  let taskRow: Record<string, any> | null;

  function routeRespond(q: RecordedQuery) {
    if (q.table === 'project_tasks' && q.op === 'select') return { data: taskRow };
    if (q.table === 'profiles') return { data: { institution_id: 'inst-1' } };
    return respond(q);
  }

  async function post(body: Record<string, unknown>) {
    const { POST } = await import('@/app/api/campus-walk/spot-check/route');
    return POST({ json: async () => body } as any);
  }

  beforeEach(() => {
    fake = makeFakeDb(routeRespond);
    taskRow = closedTask({
      spot_check: { state: 'pending', checker: 'college_head', institution_id: 'inst-1', picked_at: 'x' },
    });
    getUser.mockResolvedValue({ data: { user: { id: 'principal-1', email: 'principal@jkkn.ac.in' } } });
  });

  it('refuses anyone who is not the college head of that job, and writes nothing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'faculty-1', email: 'f@jkkn.ac.in' } } });
    const res = await post({ taskId: 'task-7', verdict: 'looks_fixed' });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('not_checker');
    expect(updates()).toHaveLength(0);
  });

  it('refuses the person who sent the fix photo, even when they are the college head', async () => {
    taskRow = closedTask({
      spot_check: {
        state: 'pending',
        checker: 'college_head',
        institution_id: 'inst-1',
        picked_at: 'x',
        fixer_profile_id: 'principal-1',
      },
    });
    const res = await post({ taskId: 'task-7', verdict: 'looks_fixed' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/You sent the fix photo/);
    expect(updates()).toHaveLength(0);
  });

  it('decides "the Director" by the same list the bell used — a Campus Walk reporter alone is not enough', async () => {
    taskRow = closedTask({
      spot_check: { state: 'pending', checker: 'director', institution_id: null, picked_at: 'x' },
    });
    getUser.mockResolvedValue({ data: { user: { id: 'walk-reporter-1', email: 'w@jkkn.ac.in' } } });
    isCampusWalkReporter.mockResolvedValue(true);
    const res = await post({ taskId: 'task-7', verdict: 'looks_fixed' });
    expect(res.status).toBe(403);
  });

  it('refuses a job that was not picked', async () => {
    taskRow = closedTask();
    const res = await post({ taskId: 'task-7', verdict: 'looks_fixed' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('not_picked');
  });

  it('"Looks fixed" marks the check passed and leaves the job closed', async () => {
    const res = await post({ taskId: 'task-7', verdict: 'looks_fixed' });
    expect(res.status).toBe(200);
    const upd = updates()[0];
    expect(filterOf(upd, 'status_key')).toBe('done');
    expect(upd.payload.status_key).toBeUndefined();
    expect(upd.payload.metadata.spot_check).toMatchObject({ state: 'passed', decided_by_profile_id: 'principal-1' });
  });

  it('"Looks fixed" does not overwrite a newer closure (compare-and-set on updated_at)', async () => {
    taskRow = { ...taskRow, updated_at: 'v5' };
    await post({ taskId: 'task-7', verdict: 'looks_fixed' });
    expect(filterOf(updates()[0], 'updated_at')).toBe('v5');
  });

  it('"Not fixed" reopens the SAME job with a fresh due date', async () => {
    const res = await post({ taskId: 'task-7', verdict: 'not_fixed', note: 'Still dripping' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, state: 'failed', status_key: 'in_progress' });
    expect(updates()[0].payload.due_date).toBe(new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10));
  });

  it('answers a second tap as already decided', async () => {
    taskRow = closedTask({
      spot_check: { state: 'passed', checker: 'college_head', institution_id: 'inst-1', picked_at: 'x' },
    });
    const res = await post({ taskId: 'task-7', verdict: 'not_fixed' });
    expect((await res.json())).toMatchObject({ success: true, already: true });
    expect(updates()).toHaveLength(0);
  });

  it('lets the Director decide the checks for the jobs he raised', async () => {
    taskRow = closedTask({
      spot_check: { state: 'pending', checker: 'director', institution_id: null, picked_at: 'x' },
    });
    getUser.mockResolvedValue({ data: { user: { id: 'director-1', email: 'director@jkkn.ac.in' } } });
    isCampusWalkReporter.mockResolvedValue(true);
    const res = await post({ taskId: 'task-7', verdict: 'looks_fixed' });
    expect(res.status).toBe(200);
  });
});

// ── (4) no owner -> caretaker -> estate office -> principal ─────────────────

describe('ruling 4 — who owns a report nobody was named for', () => {
  function ownerRespond(opts: { eao: boolean; principalStaff: boolean }) {
    return (q: RecordedQuery) => {
      if (q.table === 'profiles') return { data: opts.eao ? [{ id: 'eao-1' }] : [] };
      if (q.table === 'staff') {
        const ids = (q.filters.find(([c]) => c === 'in:profile_id')?.[1] ?? []) as string[];
        const rows = [];
        if (ids.includes('eao-1')) rows.push({ id: 'st-eao', profile_id: 'eao-1', is_active: true });
        if (ids.includes('principal-1') && opts.principalStaff) {
          rows.push({ id: 'st-principal', profile_id: 'principal-1', is_active: true });
        }
        return { data: rows };
      }
      if (q.table === 'hr_leave_applications') return { data: [] };
      return { data: null };
    };
  }

  it('the estate office first', async () => {
    fake = makeFakeDb(ownerRespond({ eao: true, principalStaff: true }));
    const r = await routeAccountable(fake.db as any, {
      kind: 'symptom',
      isUnsafe: false,
      candidateProfileId: null,
      institutionId: 'inst-1',
    });
    expect(r).toMatchObject({ accountableProfileId: 'eao-1', routedToEaoNoOwner: true, routedToPrincipalNoOwner: false });
  });

  it('then the college principal, when no estate office is on record', async () => {
    fake = makeFakeDb(ownerRespond({ eao: false, principalStaff: true }));
    const r = await routeAccountable(fake.db as any, {
      kind: 'symptom',
      isUnsafe: false,
      candidateProfileId: null,
      institutionId: 'inst-1',
    });
    expect(r).toMatchObject({
      accountableProfileId: 'principal-1',
      accountableStaffId: 'st-principal',
      routedToPrincipalNoOwner: true,
    });
  });

  it('the caretaker of the item first, when the report names one (resource_id)', async () => {
    fake = makeFakeDb((q) => {
      if (q.table === 'projects') return { data: { id: 'proj-1' } };
      if (q.table === 'resources') return { data: { caretaker_user_id: 'st-care', caretaker_user_ids: ['st-care'] } };
      if (q.table === 'staff') {
        const byId = (q.filters.find(([c]) => c === 'in:id')?.[1] ?? []) as string[];
        const byProfile = (q.filters.find(([c]) => c === 'in:profile_id')?.[1] ?? []) as string[];
        const row = { id: 'st-care', profile_id: 'care-1', is_active: true };
        return { data: byId.includes('st-care') || byProfile.includes('care-1') ? [row] : [] };
      }
      if (q.table === 'project_tasks' && q.op === 'insert') return { data: { id: 'new-task' } };
      if (q.table === 'hr_leave_applications') return { data: [] };
      return { data: null };
    });
    const { createWalkTask } = await import('@/lib/services/campus-walk/campus-walk-service');
    const res = await createWalkTask(fake.db as any, {
      title: 'Seminar hall projector — no picture',
      kind: 'symptom',
      institutionId: 'inst-1',
      raisedByProfileId: 'learner-1',
      extraMetadata: { front_door: 'instasolver', resource_id: 'res-1' },
    });
    expect(res?.accountableProfileId).toBe('care-1');
    const insert = fake.queries.find((q) => q.table === 'project_tasks' && q.op === 'insert')!;
    expect(insert.payload.owner_staff_id).toBe('st-care');
    expect(insert.payload.metadata.owner_source).toBe('caretaker');
    const [bell] = bellsIn('campus-walk:owner-routed');
    expect((bell[1] as any).recipientIds).toEqual(['care-1']);
  });

  it('unchanged for a caller that names no college (the D7 repeat flow)', async () => {
    fake = makeFakeDb(ownerRespond({ eao: false, principalStaff: true }));
    const r = await routeAccountable(fake.db as any, { kind: 'symptom', isUnsafe: false, candidateProfileId: null });
    expect(r.accountableStaffId).toBeNull();
    expect(r.routedToPrincipalNoOwner).toBe(false);
    expect(principalsByInstitution).not.toHaveBeenCalled();
  });
});
