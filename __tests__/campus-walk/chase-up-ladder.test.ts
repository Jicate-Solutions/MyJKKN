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
  jobPath,
  isCatchUpPrincipalStep,
  principalListMessage,
  principalListIdempotencyKey,
  PRINCIPAL_LIST_CATEGORY,
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

function task(dueDate: string, chase: Record<string, any> = {}, id: string = TASK, extra: Record<string, any> = {}) {
  return {
    id,
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
      ...extra,
    },
  };
}

function world(taskRow: any, opts: { principals?: any[] } = {}) {
  const rows: any[] = Array.isArray(taskRow) ? taskRow : [taskRow];
  const principals = opts.principals ?? [{ id: PRINCIPAL, full_name: 'Dr. Meena', institution_id: INST }];
  return (q: LadderQuery) => {
    if (q.op !== 'select') return { data: [{ id: TASK }] };
    switch (q.table) {
      case 'projects':
        return { data: { id: PROJ, owner_staff_id: OWNER_STAFF } };
      case 'project_tasks':
        // The review-wait pass (status_key = 'review') finds nothing here.
        return { data: filterValue(q, 'eq', 'status_key') === 'review' ? [] : rows };
      case 'project_task_assignees':
        return { data: rows.map((r) => ({ task_id: r.id, staff_id: FIXER_STAFF })) };
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

function taskUpdate(queries: LadderQuery[], id: string = TASK) {
  return queries.find(
    (q) => q.table === 'project_tasks' && q.op === 'update' && filterValue(q, 'eq', 'id') === id
  );
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

describe('jobs the old ladder already paged the Director about', () => {
  it("the old day-5 Director step counts as the day-7 step: never marked again", () => {
    const old = { reminder_1: 'a', reminder_2: 'b', escalate_accountable: 'c', escalate_director: 'd' };
    expect(rungsDue(10, old)).toEqual(['escalate_principal']);
    expect(rungsDue(10, { ...old, escalate_principal: 'e' })).toEqual([]);
  });

  it('the sweep tells the principal but never marks it for the Director summary', async () => {
    const old = { reminder_1: 'a', reminder_2: 'b', escalate_accountable: 'c', escalate_director: 'd' };
    const { db, queries } = makeLadderDb(world(task('2026-09-21', { rungs_sent: old })));
    const res = await runCampusWalkChaseUp({ client: db, now: NOW });

    expect(res.rungs.reached_director).toBe(0);
    expect(bells().map((b) => b.idempotencyKey)).toEqual([`campus-walk-chase:escalate_principal:${TASK}`]);
    const sent = taskUpdate(queries)!.payload.metadata.campus_walk_chase.rungs_sent;
    expect(sent.reached_director).toBeUndefined();
    expect(sent.escalate_director).toBe('d');
  });
});

describe('catch-up: a college with several late jobs gets ONE list, not one message each', () => {
  const T2 = '00000000-0000-4000-8000-0000000000b2';
  const T3 = '00000000-0000-4000-8000-0000000000b3';
  const old = { reminder_1: 'a', reminder_2: 'b', escalate_accountable: 'c' };

  it('only a principal step later than day 3 is catch-up', () => {
    expect(isCatchUpPrincipalStep(3)).toBe(false);
    expect(isCatchUpPrincipalStep(4)).toBe(true);
  });

  it('first morning: three jobs already late in one college -> one list to the principal, every job marked', async () => {
    const rows = [
      task('2026-09-21', { rungs_sent: old }, TASK),
      task('2026-09-26', { rungs_sent: old }, T2, { location: 'Library' }),
      task('2026-09-28', { rungs_sent: { escalate_boss: 'x' } }, T3),
    ];
    const { db, queries } = makeLadderDb(world(rows));
    const res = await runCampusWalkChaseUp({ client: db, now: NOW });

    expect(res.errors).toEqual([]);
    const principalBells = bells().filter((b) => b.category !== 'campus-walk:chase-boss');
    expect(principalBells).toHaveLength(1);
    const list = principalBells[0];
    expect(list.category).toBe(PRINCIPAL_LIST_CATEGORY);
    expect(list.recipientIds).toEqual([PRINCIPAL]);
    expect(list.idempotencyKey).toBe(principalListIdempotencyKey(INST, '2026-10-01'));
    expect(list.url).toBe(`/projects/${PROJ}`);
    expect(list.metadata.task_ids).toEqual([TASK, T2, T3]);
    expect(list.title).toBe('3 campus jobs past due at your college');
    expect(list.body).toContain('This message went to: Dr. Meena (principal).');
    expect(res.principal_lists).toBe(1);
    expect(res.rungs.escalate_principal).toBe(3);

    for (const id of [TASK, T2, T3]) {
      const chase = taskUpdate(queries, id)!.payload.metadata.campus_walk_chase;
      expect(chase.rungs_sent.escalate_principal).toBeTruthy();
      expect(chase.principal_list_key).toBe(principalListIdempotencyKey(INST, '2026-10-01'));
    }
  });

  it('an ordinary morning: two jobs reaching exactly 3 days -> the usual message each, fixer and boss copied', async () => {
    const rows = [
      task('2026-09-28', { rungs_sent: { escalate_boss: 'x' } }, TASK),
      task('2026-09-28', { rungs_sent: { escalate_boss: 'x' } }, T2),
    ];
    const { db } = makeLadderDb(world(rows));
    const res = await runCampusWalkChaseUp({ client: db, now: NOW });

    expect(res.principal_lists).toBe(0);
    expect(bells().map((b) => b.idempotencyKey)).toEqual([
      `campus-walk-chase:escalate_principal:${TASK}`,
      `campus-walk-chase:escalate_principal:${T2}`,
    ]);
    expect(bells()[0].recipientIds).toEqual([PRINCIPAL, FIXER, HEAD]);
  });

  it('a single late job in a college keeps the usual per-job message', async () => {
    const { db } = makeLadderDb(world(task('2026-09-24', { rungs_sent: old })));
    const res = await runCampusWalkChaseUp({ client: db, now: NOW });
    expect(res.principal_lists).toBe(0);
    expect(bells().map((b) => b.idempotencyKey)).toEqual([`campus-walk-chase:escalate_principal:${TASK}`]);
  });

  it("a list that fails to send leaves every job's principal step unmarked, to try again tomorrow", async () => {
    createBellNotification.mockResolvedValue(null);
    const rows = [
      task('2026-09-21', { rungs_sent: old }, TASK),
      task('2026-09-26', { rungs_sent: old }, T2),
    ];
    const { db, queries } = makeLadderDb(world(rows));
    const res = await runCampusWalkChaseUp({ client: db, now: NOW });
    expect(res.errors.join(' ')).toContain('principal list): notification send failed');
    // TASK (10 days late) still gets its day-7 marker; neither gets the principal step.
    expect(taskUpdate(queries, TASK)!.payload.metadata.campus_walk_chase.rungs_sent.escalate_principal).toBeUndefined();
    expect(taskUpdate(queries, TASK)!.payload.metadata.campus_walk_chase.principal_list_key).toBeUndefined();
    expect(taskUpdate(queries, T2)).toBeUndefined();
  });

  it('the list names every job, latest first, and cuts a long list short with a count', () => {
    const jobs = [
      { title: 'Fan not working', place: null, dueDate: '2026-09-27', daysOverdue: 4 },
      { title: 'Lift stuck', place: 'Main block', dueDate: '2026-09-20', daysOverdue: 11 },
      { title: 'Broken bench', place: null, dueDate: '2026-09-25', daysOverdue: 6 },
    ];
    const { body } = principalListMessage(jobs, [{ name: 'Dr. Meena', role: 'principal' }], { maxListed: 2 });
    expect(body.indexOf('Lift stuck')).toBeLessThan(body.indexOf('Broken bench'));
    expect(body).toContain('"Lift stuck" at Main block — 11 days past due (was due 20 Sep 2026)');
    expect(body).not.toContain('Fan not working');
    expect(body).toContain('…and 1 more on the Campus Operations board.');
    expect(body.toLowerCase()).not.toContain('despite');
  });
});

describe('routine checks open the check screen', () => {
  const ROUTINE = { routine_check: true, front_door: 'routine_check' };

  it('a routine check still waiting for its answer -> /campus-walk/check', () => {
    expect(jobPath(TASK, ROUTINE)).toBe(`/campus-walk/check?task=${TASK}`);
  });

  it('a check that became a repair ("Found a problem") -> the fix screen', () => {
    expect(jobPath(TASK, { ...ROUTINE, routine_check_outcome: 'problem' })).toBe(`/campus-walk/fix?task=${TASK}`);
  });

  it("the job's own open_path is trusted when it is a campus-walk job screen", () => {
    expect(jobPath(TASK, { ...ROUTINE, open_path: `/campus-walk/fix?task=${TASK}` })).toBe(
      `/campus-walk/fix?task=${TASK}`
    );
    expect(jobPath(TASK, { open_path: 'https://example.com/x' })).toBe(`/campus-walk/fix?task=${TASK}`);
  });

  it('an ordinary job -> the fix screen', () => {
    expect(jobPath(TASK, {})).toBe(`/campus-walk/fix?task=${TASK}`);
  });

  it("the boss's message for an overdue routine check opens the check screen", async () => {
    const { db } = makeLadderDb(world(task('2026-09-30', {}, TASK, ROUTINE)));
    await runCampusWalkChaseUp({ client: db, now: NOW });
    expect(bells()[0].url).toBe(`/campus-walk/check?task=${TASK}`);
  });
});
