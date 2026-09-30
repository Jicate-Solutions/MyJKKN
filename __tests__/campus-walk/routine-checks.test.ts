// __tests__/campus-walk/routine-checks.test.ts
// ============================================================================
// Routine checks (Director rulings, 30 Sep 2026) — lib/campus-walk/routine-checks.ts
// and app/api/campus-walk/check/route.ts.
//
//   1. Due maths      — a schedule is due on/after its date; the next date
//                       moves one period on, skipping forward past today when
//                       the job was down (one job, never a backlog).
//   2. Idempotency    — one job per schedule per due date: an existing job for
//                       the key, or a claim another run already won, creates
//                       nothing.
//   3. Owner fallback — caretaker → estate office (EAO) → principal; a person
//                       with no active personnel record is skipped.
//   4. All OK needs a photo — refused before anything is written.
//   5. Found a problem — the same job becomes an ordinary symptom repair.
// Plus the D4 guard: only a routine check can be answered here.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createWalkTask = vi.fn();
const createBellNotification = vi.fn();

vi.mock('@/lib/services/campus-walk/campus-walk-service', () => ({
  createWalkTask: (...a: unknown[]) => createWalkTask(...a),
  mapStaffToProfilesLocal: async () => new Map<string, string>(),
  routeAccountable: vi.fn()
}));
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...a: unknown[]) => createBellNotification(...a)
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEEDED_ROUTINE_CHECK_TEXTS,
  addDays,
  advanceNextDate,
  campusWalkJobPath,
  isSeededSchedule,
  isScheduleDue,
  pickRoutineOwner,
  problemConversionMetadata,
  routineCheckKey,
  routineCheckState,
  runRoutineChecks,
  todayInIndia,
  validateOutcome
} from '@/lib/campus-walk/routine-checks';

// ─── A tiny fake Supabase client ─────────────────────────────────────────────

interface Q {
  table: string;
  op: 'select' | 'update' | 'insert' | 'delete';
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
}

type Handler = (q: Q) => { data?: unknown; error?: unknown };

function fakeDb(handler: Handler) {
  const calls: Q[] = [];
  const from = (table: string) => {
    const q: Q = { table, op: 'select', filters: [] };
    calls.push(q);
    const run = () => Promise.resolve({ data: null, error: null, ...handler(q) });
    const b: any = {
      select: () => b,
      order: () => b,
      limit: () => b,
      eq: (c: string, v: unknown) => (q.filters.push(['eq', c, v]), b),
      lte: (c: string, v: unknown) => (q.filters.push(['lte', c, v]), b),
      gte: (c: string, v: unknown) => (q.filters.push(['gte', c, v]), b),
      neq: (c: string, v: unknown) => (q.filters.push(['neq', c, v]), b),
      is: (c: string, v: unknown) => (q.filters.push(['is', c, v]), b),
      in: (c: string, v: unknown) => (q.filters.push(['in', c, v]), b),
      update: (p: unknown) => ((q.op = 'update'), (q.payload = p), b),
      insert: (p: unknown) => ((q.op = 'insert'), (q.payload = p), b),
      delete: () => ((q.op = 'delete'), b),
      maybeSingle: run,
      single: run,
      then: (res: any, rej: any) => run().then(res, rej)
    };
    return b;
  };
  return { db: { from } as any, calls };
}

const has = (q: Q, col: string, val?: unknown) =>
  q.filters.some(([, c, v]) => c === col && (val === undefined || v === val));

const TODAY_NOW = new Date('2026-10-05T03:00:00Z'); // 08:30 in India
const TODAY = '2026-10-05';

const schedule = {
  id: 'sch-1',
  resource_id: 'res-1',
  maintenance_type: 'preventive',
  frequency_days: 30,
  next_maintenance_date: '2026-10-01',
  assigned_to_user_id: null,
  description: SEEDED_ROUTINE_CHECK_TEXTS[0]
};
const resource = {
  id: 'res-1',
  name: 'Desktop PC 12',
  institution_id: 'inst-1',
  caretaker_user_id: 'prof-caretaker',
  caretaker_user_ids: null,
  block_number: 'A',
  building_number: null,
  floor_number: '2',
  room_number: '204',
  location_notes: null
};

/** A world where everything goes right unless a test overrides a piece. */
function world(over: Partial<Record<string, Handler>> = {}) {
  const base: Record<string, Handler> = {
    schedulesSelect: () => ({ data: [schedule] }),
    schedulesUpdate: () => ({ data: [{ id: 'sch-1' }] }),
    resources: () => ({ data: [resource] }),
    profiles: (q) =>
      has(q, 'role', 'principal')
        ? { data: [{ id: 'prof-principal', institution_id: 'inst-1' }] }
        : has(q, 'role', 'executive_admin_officer')
          ? { data: [{ id: 'prof-eao' }] }
          : { data: [] },
    personnel: () => ({
      data: [
        { profile_id: 'prof-caretaker', is_active: true },
        { profile_id: 'prof-eao', is_active: true },
        { profile_id: 'prof-principal', is_active: true }
      ]
    }),
    tasksByKey: () => ({ data: [] }),
    tasksOther: () => ({ data: { metadata: { source: 'campus-walk' } } }),
    logs: () => ({ data: { id: 'log-1' } })
  };
  const h = { ...base, ...over };
  return fakeDb((q) => {
    switch (q.table) {
      case 'resource_maintenance_schedules':
        return q.op === 'update' ? h.schedulesUpdate(q) : h.schedulesSelect(q);
      case 'resources':
        return h.resources(q);
      case 'profiles':
        return h.profiles(q);
      case 'staff':
        return h.personnel(q);
      case 'project_tasks':
        return has(q, 'metadata->>routine_check_key') ? h.tasksByKey(q) : h.tasksOther(q);
      case 'resource_maintenance_logs':
        return h.logs(q);
      default:
        return { data: null };
    }
  });
}

beforeEach(() => {
  createWalkTask.mockReset();
  createBellNotification.mockReset();
  createWalkTask.mockResolvedValue({ taskId: 'task-1', attachmentId: null, accountableProfileId: 'prof-caretaker' });
  createBellNotification.mockResolvedValue(null);
});

// ─── 1. Due maths ────────────────────────────────────────────────────────────

describe('schedule due maths', () => {
  it('is due on its date and every day after, not before', () => {
    expect(isScheduleDue('2026-10-05', TODAY)).toBe(true);
    expect(isScheduleDue('2026-09-01', TODAY)).toBe(true);
    expect(isScheduleDue('2026-10-06', TODAY)).toBe(false);
    expect(isScheduleDue(null, TODAY)).toBe(false);
  });

  it('moves one period on', () => {
    expect(advanceNextDate('2026-10-05', 30, TODAY)).toBe('2026-11-04');
  });

  it('skips forward past today when runs were missed — one job, never a backlog', () => {
    // Due 1 Jul, cron down until 5 Oct: next lands after today, not on 31 Jul.
    const next = advanceNextDate('2026-07-01', 30, TODAY);
    expect(next > TODAY).toBe(true);
    expect(next).toBe('2026-10-29');
  });

  it('crosses month and year ends correctly', () => {
    expect(addDays('2026-12-20', 30)).toBe('2027-01-19');
    expect(addDays('2027-02-27', 2)).toBe('2027-03-01');
  });

  it('uses the date in India, not UTC', () => {
    // 20:00 UTC on 4 Oct is 01:30 on 5 Oct in India.
    expect(todayInIndia(new Date('2026-10-04T20:00:00Z'))).toBe('2026-10-05');
  });
});

// ─── 2. Idempotency ──────────────────────────────────────────────────────────

describe('idempotency — one job per schedule per due date', () => {
  it('keys a job by schedule id + due date', () => {
    expect(routineCheckKey('sch-1', '2026-10-01')).toBe('sch-1:2026-10-01');
  });

  it('creates one job, writes the log and advances the schedule', async () => {
    const { db, calls } = world();
    const r = await runRoutineChecks(db, { now: TODAY_NOW });
    expect(r.created).toBe(1);
    expect(r.logs_written).toBe(1);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    const input = createWalkTask.mock.calls[0][1];
    expect(input.title).toBe('Routine check: Desktop PC 12 (Block A · Floor 2 · Room 204)');
    expect(input.extraMetadata.routine_check).toBe(true);
    expect(input.extraMetadata.front_door).toBe('routine_check');
    expect(input.extraMetadata.routine_check_key).toBe('sch-1:2026-10-01');

    // The claim is conditional on the date it read, and moves it past today.
    const claim = calls.find((q) => q.table === 'resource_maintenance_schedules' && q.op === 'update')!;
    expect(has(claim, 'next_maintenance_date', '2026-10-01')).toBe(true);
    expect((claim.payload as any).next_maintenance_date).toBe('2026-10-31');

    // Due in 7 days, not the symptom lane's 2.
    const dueWrite = calls.find((q) => q.table === 'project_tasks' && q.op === 'update')!;
    expect((dueWrite.payload as any).due_date).toBe('2026-10-12');
    expect((dueWrite.payload as any).metadata.routine_check_log_id).toBe('log-1');

    // The bell links to the check screen, once per key.
    const bell = createBellNotification.mock.calls[0][1];
    expect(bell.url).toBe('/campus-walk/check?task=task-1');
    expect(bell.idempotencyKey).toBe('campus-walk-routine-check:sch-1:2026-10-01');
  });

  it('creates nothing when a job for the key already exists (retry after a half-finished run)', async () => {
    const { db } = world({ tasksByKey: () => ({ data: [{ id: 'task-old' }] }) });
    const r = await runRoutineChecks(db, { now: TODAY_NOW });
    expect(r.created).toBe(0);
    expect(r.skipped_already_created).toBe(1);
    expect(createWalkTask).not.toHaveBeenCalled();
  });

  it('creates nothing when another run already claimed the date', async () => {
    const { db } = world({ schedulesUpdate: () => ({ data: [] }) });
    const r = await runRoutineChecks(db, { now: TODAY_NOW });
    expect(r.created).toBe(0);
    expect(r.skipped_claimed_elsewhere).toBe(1);
    expect(createWalkTask).not.toHaveBeenCalled();
  });

  it('gives the date back when the job could not be created', async () => {
    createWalkTask.mockResolvedValueOnce(null);
    const { db, calls } = world();
    const r = await runRoutineChecks(db, { now: TODAY_NOW });
    expect(r.failed).toBe(1);
    const updates = calls.filter((q) => q.table === 'resource_maintenance_schedules' && q.op === 'update');
    expect((updates[updates.length - 1].payload as any).next_maintenance_date).toBe('2026-10-01');
  });

  it('stops at the per-run cap and reports what is left', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...schedule, id: `sch-${i}`, resource_id: `res-${i}` }));
    const items = many.map((m) => ({ ...resource, id: m.resource_id }));
    const { db } = world({ schedulesSelect: () => ({ data: many }), resources: () => ({ data: items }) });
    const r = await runRoutineChecks(db, { now: TODAY_NOW, cap: 2 });
    expect(r.created).toBe(2);
    expect(r.left_for_next_run).toBe(3);
  });
});

// ─── 3. Owner fallback ───────────────────────────────────────────────────────

describe('owner fallback — caretaker → EAO → principal', () => {
  const all = new Set(['care', 'eao', 'prin', 'sched']);

  it('the caretaker first', () => {
    expect(
      pickRoutineOwner({
        caretakerProfileIds: ['care'],
        eaoProfileIds: ['eao'],
        principalProfileIds: ['prin'],
        profilesWithActiveStaff: all
      })
    ).toEqual({ profileId: 'care', via: 'caretaker' });
  });

  it('the EAO when there is no caretaker, or the caretaker has no active personnel record', () => {
    const base = { eaoProfileIds: ['eao'], principalProfileIds: ['prin'] };
    expect(pickRoutineOwner({ ...base, caretakerProfileIds: [], profilesWithActiveStaff: all }).via).toBe('eao');
    expect(
      pickRoutineOwner({
        ...base,
        caretakerProfileIds: ['gone'],
        profilesWithActiveStaff: all
      })
    ).toEqual({ profileId: 'eao', via: 'eao' });
  });

  it('the principal when there is no EAO', () => {
    expect(
      pickRoutineOwner({
        caretakerProfileIds: [null],
        eaoProfileIds: [],
        principalProfileIds: ['prin'],
        profilesWithActiveStaff: all
      })
    ).toEqual({ profileId: 'prin', via: 'principal' });
  });

  it('nobody when nobody has an active personnel record', () => {
    expect(
      pickRoutineOwner({
        caretakerProfileIds: ['care'],
        eaoProfileIds: ['eao'],
        principalProfileIds: ['prin'],
        profilesWithActiveStaff: new Set()
      })
    ).toEqual({ profileId: null, via: 'nobody' });
  });

  it('a person named on the schedule row is ignored — anyone can write that row (repair round)', async () => {
    const { db } = world({
      schedulesSelect: () => ({ data: [{ ...schedule, assigned_to_user_id: 'prof-anybody' }] }),
      personnel: () => ({
        data: [
          { profile_id: 'prof-caretaker', is_active: true },
          { profile_id: 'prof-anybody', is_active: true }
        ]
      })
    });
    await runRoutineChecks(db, { now: TODAY_NOW });
    expect(createWalkTask.mock.calls[0][1].accountableProfileId).toBe('prof-caretaker');
    expect(createWalkTask.mock.calls[0][1].extraMetadata.routine_check_owner_via).toBe('caretaker');
  });

  it('the cron hands the job to the EAO when the caretaker has left', async () => {
    const { db } = world({
      personnel: () => ({ data: [{ profile_id: 'prof-eao', is_active: true }] })
    });
    await runRoutineChecks(db, { now: TODAY_NOW });
    expect(createWalkTask.mock.calls[0][1].accountableProfileId).toBe('prof-eao');
    expect(createWalkTask.mock.calls[0][1].extraMetadata.routine_check_owner_via).toBe('eao');
  });

  it('the cron hands the job to the principal when there is no EAO either', async () => {
    const { db } = world({
      profiles: (q) =>
        has(q, 'role', 'principal') ? { data: [{ id: 'prof-principal', institution_id: 'inst-1' }] } : { data: [] },
      personnel: () => ({ data: [{ profile_id: 'prof-principal', is_active: true }] })
    });
    await runRoutineChecks(db, { now: TODAY_NOW });
    expect(createWalkTask.mock.calls[0][1].accountableProfileId).toBe('prof-principal');
  });
});

// ─── 4. All OK needs a photo ─────────────────────────────────────────────────

describe('All OK requires one photo', () => {
  it('refuses All OK without a photo', () => {
    const r = validateOutcome({ result: 'all_ok', hasPhoto: false, note: '' });
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe('no_photo');
  });

  it('accepts All OK with a photo and no note', () => {
    expect(validateOutcome({ result: 'all_ok', hasPhoto: true, note: '' }).ok).toBe(true);
  });

  it('Found a problem needs one line, not a photo', () => {
    expect(validateOutcome({ result: 'problem', hasPhoto: false, note: 'UPS dead' }).ok).toBe(true);
    expect((validateOutcome({ result: 'problem', hasPhoto: true, note: ' ' }) as any).code).toBe('no_note');
  });

  it('the route refuses All OK without a photo before touching the database', async () => {
    vi.resetModules();
    const serviceRole = vi.fn();
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
      createServiceRoleClient: serviceRole
    }));
    const { POST } = await import('@/app/api/campus-walk/check/route');
    const form = new FormData();
    form.set('task_id', 'task-1');
    form.set('action', 'all_ok');
    const res = await POST({ formData: async () => form } as any);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('no_photo');
    expect(serviceRole).not.toHaveBeenCalled();
    vi.doUnmock('@/lib/supabase/server');
  });
});

// ─── 5. Found a problem → repair job; D4 guard ───────────────────────────────

describe('Found a problem turns the check into a normal repair job', () => {
  it('becomes a symptom job, keeps its origin and records the answer', () => {
    const before = {
      source: 'campus-walk',
      kind: 'symptom',
      routine_check: true,
      front_door: 'routine_check',
      attribution: 'Routine check',
      photo_storage_path: null
    };
    const outcome = { result: 'problem', note: 'UPS dead' };
    const after = problemConversionMetadata(before, outcome, 'task-1/check/abc.jpg');
    expect(after.kind).toBe('symptom');
    expect(after.source).toBe('campus-walk');
    expect(after.routine_check).toBe(true);
    expect(after.routine_check_outcome).toEqual(outcome);
    // The fix screen supersedes this photo when the repair photo arrives.
    expect(after.photo_storage_path).toBe('task-1/check/abc.jpg');
    // Never a verified closure: fix.approval is not invented here.
    expect(after.fix).toBeUndefined();
    expect(routineCheckState({ status_key: 'todo', metadata: after })).toBe('answered');
  });

  it('only an unanswered routine check can be answered (no one-photo close of a repair job)', () => {
    const walk = { source: 'campus-walk', kind: 'symptom' };
    expect(routineCheckState({ status_key: 'todo', metadata: walk })).toBe('not_routine');
    expect(routineCheckState({ status_key: 'todo', metadata: { ...walk, routine_check: true } })).toBe('open');
    expect(routineCheckState({ status_key: 'done', metadata: { ...walk, routine_check: true } })).toBe('closed');
    expect(
      routineCheckState({ status_key: 'todo', metadata: { source: 'other', routine_check: true } })
    ).toBe('not_routine');
  });
});

// ─── Repair round, 1 Oct 2026 (reviewer findings on #4145) ───────────────────

describe('only the seed’s own schedules become jobs (schedules are writable by any signed-in user)', () => {
  it('the five texts in the lib are exactly the five texts the migration writes', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20270620090000_campus_walk_routine_check_schedules.sql'),
      'utf8'
    );
    const inSql = [...sql.matchAll(/^\s*'(Monthly [^']+)'\s*$/gm)].map((m) => m[1]);
    expect(inSql).toEqual([...SEEDED_ROUTINE_CHECK_TEXTS]);
  });

  it('recognises a seeded row and refuses anything else', () => {
    expect(isSeededSchedule(schedule)).toBe(true);
    expect(isSeededSchedule({ ...schedule, description: 'Please call me' })).toBe(false);
    expect(isSeededSchedule({ ...schedule, maintenance_type: 'corrective' })).toBe(false);
    expect(isSeededSchedule({ ...schedule, frequency_days: 1 })).toBe(false);
  });

  it('asks the database for seeded rows only, so planted rows cannot fill the scan window', async () => {
    const { db, calls } = world();
    await runRoutineChecks(db, { now: TODAY_NOW });
    const read = calls.find((q) => q.table === 'resource_maintenance_schedules' && q.op === 'select')!;
    expect(has(read, 'maintenance_type', 'preventive')).toBe(true);
    expect(read.filters.some(([op, c, v]) => op === 'in' && c === 'description' && (v as string[]).length === 5)).toBe(
      true
    );
    expect(read.filters.some(([op, c]) => op === 'gte' && c === 'frequency_days')).toBe(true);
  });

  it('skips and counts a row that is not the seed’s, creating nothing and sending no bell', async () => {
    const { db } = world({
      schedulesSelect: () => ({ data: [{ ...schedule, description: 'Click this link' }] })
    });
    const r = await runRoutineChecks(db, { now: TODAY_NOW });
    expect(r.created).toBe(0);
    expect(r.skipped_not_seeded).toBe(1);
    expect(createWalkTask).not.toHaveBeenCalled();
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('creates at most one job per item per run', async () => {
    const { db } = world({
      schedulesSelect: () => ({ data: [schedule, { ...schedule, id: 'sch-2' }] })
    });
    const r = await runRoutineChecks(db, { now: TODAY_NOW });
    expect(r.created).toBe(1);
    expect(r.skipped_duplicate_item).toBe(1);
  });
});

describe('links for a routine check open the check screen until it is answered', () => {
  it('the new job carries open_path to the check screen', async () => {
    const { db, calls } = world();
    await runRoutineChecks(db, { now: TODAY_NOW });
    const write = calls.find((q) => q.table === 'project_tasks' && q.op === 'update')!;
    expect((write.payload as any).metadata.open_path).toBe('/campus-walk/check?task=task-1');
  });

  it('Found a problem switches open_path to the fix screen', () => {
    const after = problemConversionMetadata(
      { source: 'campus-walk', routine_check: true, open_path: '/campus-walk/check?task=t9' },
      { result: 'problem' },
      null,
      't9'
    );
    expect(after.open_path).toBe('/campus-walk/fix?task=t9');
    expect(campusWalkJobPath('t9', after)).toBe('/campus-walk/fix?task=t9');
  });

  it('campusWalkJobPath: unanswered check → check screen; repair or ordinary job → fix screen', () => {
    expect(campusWalkJobPath('t1', { source: 'campus-walk', routine_check: true })).toBe('/campus-walk/check?task=t1');
    expect(
      campusWalkJobPath('t1', { source: 'campus-walk', routine_check: true, routine_check_outcome: { result: 'problem' } })
    ).toBe('/campus-walk/fix?task=t1');
    expect(campusWalkJobPath('t1', { source: 'campus-walk' })).toBe('/campus-walk/fix?task=t1');
    expect(campusWalkJobPath('t1', { open_path: 'https://evil.example/' })).toBe('/campus-walk/fix?task=t1');
  });

  it('a check whose repair photo is awaiting approval cannot be answered with All OK', () => {
    const m = { source: 'campus-walk', routine_check: true };
    expect(routineCheckState({ status_key: 'review', metadata: m })).toBe('in_repair');
    expect(routineCheckState({ status_key: 'todo', metadata: { ...m, fix: { submitted_at: '2026-10-01' } } })).toBe(
      'in_repair'
    );
  });
});

describe('the check route: one answer wins, and a photo cannot be reused', () => {
  const task = {
    id: 'task-1',
    project_id: 'proj-1',
    title: 'Routine check: PC',
    description: 'x',
    due_date: '2026-10-12',
    status_key: 'todo',
    owner_staff_id: 'st-1',
    metadata: { source: 'campus-walk', routine_check: true, routine_check_log_id: 'log-1', routine_check_schedule_id: 'sch-1' }
  };

  async function callRoute(action: 'all_ok' | 'problem', handler: Handler) {
    vi.resetModules();
    const { db, calls } = fakeDb(handler);
    const admin = {
      from: db.from,
      storage: { from: () => ({ upload: async () => ({ error: null }) }) }
    };
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
      createServiceRoleClient: () => admin
    }));
    vi.doMock('@/lib/services/pde/jpeg-metadata', () => ({
      isJpegMagic: () => true,
      stripJpegMetadata: (b: Uint8Array) => b,
      scanJpegForMetadata: () => ({ ok: true })
    }));
    vi.doMock('@/lib/campus-walk/routine-checks', async (orig) => ({
      ...(await (orig as any)()),
      resolveCheckAccess: async () => ({
        allowed: true,
        task,
        via: 'assignee',
        callerStaffId: 'st-1',
        callerName: 'A',
        accountableStaffId: 'st-1'
      }),
      accountableProfileOf: async () => 'prof-1'
    }));
    const svc = await import('@/lib/services/campus-walk/campus-walk-service');
    (svc.routeAccountable as any).mockResolvedValue?.({ dueDate: '2026-10-03' });
    const { POST } = await import('@/app/api/campus-walk/check/route');
    const form = new FormData();
    form.set('task_id', 'task-1');
    form.set('action', action);
    if (action === 'problem') form.set('note', 'UPS dead');
    form.set('photo', new Blob([new Uint8Array(2048)], { type: 'image/jpeg' }));
    const res = await POST({ formData: async () => form } as any);
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/services/pde/jpeg-metadata');
    vi.doUnmock('@/lib/campus-walk/routine-checks');
    return { res, json: await res.json(), calls };
  }

  const baseHandler =
    (over: { closeRows?: unknown[]; reused?: unknown[] }): Handler =>
    (q) => {
      if (q.table === 'project_task_attachments') {
        return q.op === 'insert' ? { data: { id: 'att-new' } } : { data: [] };
      }
      if (q.table === 'project_tasks' && q.op === 'select') return { data: over.reused ?? [] };
      if (q.table === 'project_tasks' && q.op === 'update') return { data: over.closeRows ?? [{ id: 'task-1' }] };
      return { data: null };
    };

  it('All OK that loses the race gets 409, removes its photo row, and writes no log or schedule', async () => {
    const { res, json, calls } = await callRoute('all_ok', baseHandler({ closeRows: [] }));
    expect(res.status).toBe(409);
    expect(json.code).toBe('already_answered');
    const close = calls.find((q) => q.table === 'project_tasks' && q.op === 'update')!;
    expect(has(close, 'status_key', 'todo')).toBe(true);
    expect(close.filters.some(([op, c, v]) => op === 'is' && c === 'metadata->routine_check_outcome' && v === null)).toBe(
      true
    );
    expect(calls.some((q) => q.table === 'project_task_attachments' && q.op === 'delete')).toBe(true);
    expect(calls.some((q) => q.table === 'resource_maintenance_logs')).toBe(false);
    expect(calls.some((q) => q.table === 'resource_maintenance_schedules')).toBe(false);
  });

  it('Found a problem that loses the race gets 409 and raises no repair log or bell', async () => {
    const { res, json, calls } = await callRoute('problem', baseHandler({ closeRows: [] }));
    expect(res.status).toBe(409);
    expect(json.code).toBe('already_answered');
    expect(calls.some((q) => q.table === 'resource_maintenance_logs')).toBe(false);
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('All OK refuses a photo already used to close another check', async () => {
    const { res, json, calls } = await callRoute('all_ok', baseHandler({ reused: [{ id: 'task-other' }] }));
    expect(res.status).toBe(409);
    expect(json.code).toBe('photo_reused');
    expect(calls.some((q) => q.table === 'project_tasks' && q.op === 'update')).toBe(false);
  });

  it('All OK that wins records the photo fingerprint and closes the job', async () => {
    const { res, calls } = await callRoute('all_ok', baseHandler({}));
    expect(res.status).toBe(200);
    const close = calls.find((q) => q.table === 'project_tasks' && q.op === 'update')!;
    expect((close.payload as any).status_key).toBe('done');
    expect(typeof (close.payload as any).metadata.routine_check_outcome.photo_sha).toBe('string');
  });
});
