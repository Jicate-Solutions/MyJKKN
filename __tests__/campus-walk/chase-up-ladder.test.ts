// __tests__/campus-walk/chase-up-ladder.test.ts
// ============================================================================
// The overdue ladder (Director ruling, 30 Sep 2026): a job nobody has touched
// climbs by itself — the fixer's boss at 1 day late, the college principal at
// 3, the Director at 7 (and only through his one morning summary).
//
// Each block below is a way this goes wrong quietly:
//   - a rung fires a day early or late, or twice in one round;
//   - a paused job ("I can't fix this yet") keeps climbing;
//   - the Director is paged once per job at day 7 instead of in the summary;
//   - a job already told under the old ladder tells the same boss again;
//   - the messages lecture people or leave out who else was told.
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
  rungsDue,
  resolveBoss,
  climbMessage,
  toldLine,
  runCampusWalkChaseUp,
} from '@/lib/campus-walk/chase-up';

const PROJ = '00000000-0000-4000-8000-0000000000aa';
const TASK = '00000000-0000-4000-8000-0000000000bb';
const FIXER = '00000000-0000-4000-8000-000000000f01';
const FIXER_STAFF = '00000000-0000-4000-8000-000000000f02';
const HEAD = '00000000-0000-4000-8000-000000000a01';
const HEAD_STAFF = '00000000-0000-4000-8000-000000000a02';
const MANAGER = '00000000-0000-4000-8000-000000000b01';
const OWNER = '00000000-0000-4000-8000-000000000c01';
const OWNER_STAFF = '00000000-0000-4000-8000-000000000c02';
const PRINCIPAL = '00000000-0000-4000-8000-000000000e01';
const DEPT = '00000000-0000-4000-8000-000000000d01';
const INST = '00000000-0000-4000-8000-000000000d02';

// 08:00 IST on 1 Oct 2026, when the ladder runs.
const NOW = new Date('2026-10-01T02:30:00.000Z');

function task(dueDate: string, chase: Record<string, any> = {}) {
  return {
    id: TASK,
    title: 'Tap will not turn off',
    description: '',
    due_date: dueDate,
    status_key: 'todo',
    owner_staff_id: FIXER_STAFF,
    metadata: {
      source: 'campus-walk',
      institution_id: INST,
      location: 'Block A ground-floor washroom',
      campus_walk_chase: chase,
    },
  };
}

function world(taskRow: any, opts: { principals?: any[] } = {}) {
  const principals = opts.principals ?? [{ id: PRINCIPAL, full_name: 'Dr. Meena', institution_id: INST }];
  return (q: LadderQuery) => {
    if (q.op !== 'select') return { data: [{ id: TASK }] };
    switch (q.table) {
      case 'projects':
        return { data: { id: PROJ, owner_staff_id: OWNER_STAFF } };
      case 'project_tasks':
        // The review-wait pass (status_key = 'review') finds nothing here.
        return { data: filterValue(q, 'eq', 'status_key') === 'review' ? [] : [taskRow] };
      case 'project_task_assignees':
        return { data: [{ task_id: TASK, staff_id: FIXER_STAFF }] };
      case 'staff':
        if (filterValue(q, 'eq', 'id') === OWNER_STAFF) return { data: { profile_id: OWNER, is_active: true } };
        if (filterValue(q, 'in', 'profile_id')) return { data: [{ id: HEAD_STAFF, profile_id: HEAD, is_active: true }] };
        return { data: [{ id: FIXER_STAFF, profile_id: FIXER, is_active: true, department_id: DEPT }] };
      case 'departments':
        return { data: [{ id: DEPT, head_of_department_id: HEAD }] };
      case 'hr_staff_details':
        return { data: [] };
      case 'profiles':
        if (filterValue(q, 'eq', 'role') === 'principal') return { data: principals };
        return {
          data: [
            { id: FIXER, is_active: true, full_name: 'Ravi' },
            { id: HEAD, is_active: true, full_name: 'Kumar' },
            { id: OWNER, is_active: true, full_name: 'Estate Office' },
          ],
        };
      default:
        return { data: null };
    }
  };
}

function bells() {
  return createBellNotification.mock.calls.map((c) => c[1]);
}

function taskUpdate(queries: LadderQuery[]) {
  return queries.find((q) => q.table === 'project_tasks' && q.op === 'update');
}

beforeEach(() => {
  createBellNotification.mockReset();
  createBellNotification.mockResolvedValue('notif-1');
});

describe('rung timing — 1 day boss, 3 days principal, 7 days Director', () => {
  it('nothing on the due date itself', () => {
    expect(rungsDue(0, {})).toEqual([]);
  });

  it('the boss at 1 day, and still only the boss at 2', () => {
    expect(rungsDue(1, {})).toEqual(['escalate_boss']);
    expect(rungsDue(2, { escalate_boss: 'x' })).toEqual([]);
  });

  it('the principal at 3 days, the Director at 7', () => {
    expect(rungsDue(3, { escalate_boss: 'x' })).toEqual(['escalate_principal']);
    expect(rungsDue(6, { escalate_boss: 'x', escalate_principal: 'x' })).toEqual([]);
    expect(rungsDue(7, { escalate_boss: 'x', escalate_principal: 'x' })).toEqual(['reached_director']);
  });

  it('a job found late after a missed run gets every step it has reached, in order', () => {
    expect(rungsDue(9, {})).toEqual(['escalate_boss', 'escalate_principal', 'reached_director']);
  });

  it('each step at most once per round: a sent step never repeats', () => {
    const all = { escalate_boss: 'a', escalate_principal: 'b', reached_director: 'c' };
    expect(rungsDue(30, all)).toEqual([]);
  });

  it("a job already told under the old ladder's day-3 step does not tell the boss again", () => {
    expect(rungsDue(4, { reminder_1: 'a', reminder_2: 'b', escalate_accountable: 'c' })).toEqual([
      'escalate_principal',
    ]);
  });
});

describe('who the boss is', () => {
  const base = {
    accountableProfileId: FIXER,
    accountableStaffId: FIXER_STAFF,
    departmentId: DEPT,
    deptHeadByDept: new Map([[DEPT, HEAD]]),
    managerProfileByStaff: new Map([[FIXER_STAFF, MANAGER]]),
    profileActive: new Map<string, boolean>(),
    projectOwnerProfileId: OWNER,
  };

  it('the department head first', () => {
    expect(resolveBoss(base)).toMatchObject({ id: HEAD, role: 'department head' });
  });

  it('the reporting manager when the department has no head', () => {
    expect(resolveBoss({ ...base, deptHeadByDept: new Map() })).toMatchObject({
      id: MANAGER,
      role: 'reporting manager',
    });
  });

  it('the estate office when there is neither', () => {
    expect(
      resolveBoss({ ...base, deptHeadByDept: new Map(), managerProfileByStaff: new Map() })
    ).toMatchObject({ id: OWNER, role: 'estate office' });
  });

  it('a head who is the fixer themselves climbs past to the next person', () => {
    expect(resolveBoss({ ...base, accountableProfileId: HEAD })).toMatchObject({ id: MANAGER });
  });

  it('an inactive head is skipped', () => {
    expect(resolveBoss({ ...base, profileActive: new Map([[HEAD, false]]) })).toMatchObject({ id: MANAGER });
  });
});

describe('the words', () => {
  const ctx = {
    title: 'Tap will not turn off',
    place: 'Block A washroom',
    dueDate: '2026-09-28',
    daysOverdue: 3,
    bossLabel: 'the department head',
    told: [
      { name: 'Dr. Meena', role: 'principal' },
      { name: 'Ravi', role: 'responsible for the job' },
    ],
  };

  it('names the job, the place, the date and who was told', () => {
    const m = climbMessage('escalate_principal', ctx);
    expect(m.body).toContain('"Tap will not turn off" at Block A washroom');
    expect(m.body).toContain('28 Sep 2026');
    expect(m.body).toContain('This message went to: Dr. Meena (principal) and Ravi (responsible for the job).');
    expect(m.title).toBe('Still open, 3 days past due: Tap will not turn off');
  });

  it('no lecturing lines from the old ladder', () => {
    for (const rung of ['escalate_boss', 'escalate_principal'] as const) {
      const body = climbMessage(rung, ctx).body.toLowerCase();
      expect(body).not.toContain('unexplained');
      expect(body).not.toContain('despite');
      expect(body).not.toContain('please action');
    }
  });

  it('does not repeat the place when the title already says it', () => {
    const m = climbMessage('escalate_boss', { ...ctx, title: 'Block A washroom — tap leaking' });
    expect(m.body).toContain('"Block A washroom — tap leaking" was due');
  });

  it('a person with no name on record is named by role', () => {
    expect(toldLine([{ name: null, role: 'estate office' }])).toBe('This message went to: the estate office.');
  });
});

describe('the sweep', () => {
  it('3 days late: the boss (with the fixer), then the principal (with both) — two messages', async () => {
    const { db, queries } = makeLadderDb(world(task('2026-09-28')));
    const res = await runCampusWalkChaseUp({ client: db, now: NOW });

    expect(res.errors).toEqual([]);
    const [boss, principal] = bells();
    expect(bells()).toHaveLength(2);

    expect(boss.recipientIds).toEqual([FIXER, HEAD]);
    expect(boss.idempotencyKey).toBe(`campus-walk-chase:escalate_boss:${TASK}`);
    expect(boss.url).toBe(`/campus-walk/fix?task=${TASK}`);
    expect(boss.body).toContain('This message went to: Ravi (responsible for the job) and Kumar (department head).');

    expect(principal.recipientIds).toEqual([PRINCIPAL, FIXER, HEAD]);
    expect(principal.idempotencyKey).toBe(`campus-walk-chase:escalate_principal:${TASK}`);
    expect(principal.url).toBe(`/projects/${PROJ}`);
    expect(principal.body).toContain('Block A ground-floor washroom');

    const sent = taskUpdate(queries)!.payload.metadata.campus_walk_chase.rungs_sent;
    expect(Object.keys(sent).sort()).toEqual(['escalate_boss', 'escalate_principal']);
  });

  it('7+ days late: no message goes to the Director — the job is only marked for the summary', async () => {
    const { db, queries } = makeLadderDb(
      world(task('2026-09-23', { rungs_sent: { escalate_boss: 'a', escalate_principal: 'b' } }))
    );
    const res = await runCampusWalkChaseUp({ client: db, now: NOW });

    expect(createBellNotification).not.toHaveBeenCalled();
    expect(res.rungs.reached_director).toBe(1);
    const sent = taskUpdate(queries)!.payload.metadata.campus_walk_chase.rungs_sent;
    expect(sent.reached_director).toBe(NOW.toISOString());
  });

  it('a rerun the same day sends nothing again', async () => {
    const chase = { rungs_sent: { escalate_boss: 'a', escalate_principal: 'b', reached_director: 'c' } };
    const { db, queries } = makeLadderDb(world(task('2026-09-20', chase)));
    await runCampusWalkChaseUp({ client: db, now: NOW });
    expect(createBellNotification).not.toHaveBeenCalled();
    expect(taskUpdate(queries)).toBeUndefined();
  });

  it('a job reopened with "Not fixed" climbs again under round-suffixed keys', async () => {
    const { db } = makeLadderDb(world(task('2026-09-30', { rungs_sent: {}, round: 2 })));
    await runCampusWalkChaseUp({ client: db, now: NOW });
    expect(bells().map((b) => b.idempotencyKey)).toEqual([`campus-walk-chase:escalate_boss:${TASK}:r2`]);
  });

  it('no principal on record: the boss step still goes, the principal step waits and is not marked', async () => {
    const { db, queries } = makeLadderDb(world(task('2026-09-28'), { principals: [] }));
    const res = await runCampusWalkChaseUp({ client: db, now: NOW });

    expect(bells()).toHaveLength(1);
    expect(bells()[0].idempotencyKey).toContain('escalate_boss');
    expect(res.errors.join(' ')).toContain('no active principal on record');
    const sent = taskUpdate(queries)!.payload.metadata.campus_walk_chase.rungs_sent;
    expect(sent.escalate_principal).toBeUndefined();
  });
});

describe('paused jobs do not climb', () => {
  it('the candidate query leaves out every paused job (is_blocked = true)', async () => {
    const { db, queries } = makeLadderDb(world(task('2026-09-28')));
    await runCampusWalkChaseUp({ client: db, now: NOW });
    const candidate = queries.find(
      (q) => q.table === 'project_tasks' && q.op === 'select' && filterValue(q, 'lt', 'due_date')
    )!;
    expect(filterValue(candidate, 'eq', 'is_blocked')).toBe(false);
  });

  it('a job un-paused today is measured against its pushed-out due date, not the original', async () => {
    // Originally due 24 Sep; paused 5 days, so un-pausing moved it to 29 Sep:
    // 2 days late, not 7 — the boss only, no principal, no Director.
    const { db, queries } = makeLadderDb(world(task('2026-09-29')));
    await runCampusWalkChaseUp({ client: db, now: NOW });
    expect(bells().map((b) => b.idempotencyKey)).toEqual([`campus-walk-chase:escalate_boss:${TASK}`]);
    const sent = taskUpdate(queries)!.payload.metadata.campus_walk_chase.rungs_sent;
    expect(sent.reached_director).toBeUndefined();
  });
});
