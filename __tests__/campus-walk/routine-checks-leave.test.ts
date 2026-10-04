// __tests__/campus-walk/routine-checks-leave.test.ts
// ============================================================================
// Director answer, 1 Oct 2026: a routine check whose owner is on leave goes to
// their leave stand-in.
//
// The daily job does not have its own leave rule. It hands every job to
// createWalkTask (lib/services/campus-walk/campus-walk-service.ts), whose
// routeAccountable() already reads hr_leave_applications and moves an on-leave
// owner's job to their department head (else the estate office), pausing the
// clock. This file proves that path END TO END: unlike routine-checks.test.ts,
// campus-walk-service is NOT mocked here — the real createWalkTask runs against
// a small in-memory database. If the daily job stopped going through
// createWalkTask, or stopped using the person createWalkTask settled on, the
// on-leave test below fails.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createBellNotification = vi.fn();
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...a: unknown[]) => createBellNotification(...a)
}));

import { SEEDED_ROUTINE_CHECK_TEXTS, runRoutineChecks } from '@/lib/campus-walk/routine-checks';

// ─── A small in-memory Supabase client ───────────────────────────────────────

type Row = Record<string, any>;
type Filter = [op: string, col: string, val: unknown];

function memoryDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  let nextId = 1;

  const matches = (row: Row, filters: Filter[]) =>
    filters.every(([op, col, val]) => {
      const cell = row[col];
      switch (op) {
        case 'eq':
          return cell === val;
        case 'neq':
          return cell !== val;
        case 'is':
          return cell === val || (val === null && cell === undefined);
        case 'in':
          return (val as unknown[]).includes(cell);
        case 'lte':
          return cell !== undefined && cell !== null && cell <= (val as any);
        case 'gte':
          return cell !== undefined && cell !== null && cell >= (val as any);
        default:
          return true;
      }
    });

  const from = (table: string) => {
    tables[table] ??= [];
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any;
    let limitN: number | null = null;

    const exec = (): Row[] => {
      const rows = tables[table];
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((p: Row) => ({
          id: `${table}-${nextId++}`,
          ...p
        }));
        rows.push(...list);
        return list;
      }
      const hit = rows.filter((r) => matches(r, filters));
      if (op === 'update') {
        for (const r of hit) Object.assign(r, payload);
        return hit;
      }
      if (op === 'delete') {
        tables[table] = rows.filter((r) => !hit.includes(r));
        return hit;
      }
      return limitN === null ? hit : hit.slice(0, limitN);
    };

    const b: any = {
      select: () => b,
      order: () => b,
      limit: (n: number) => ((limitN = n), b),
      eq: (c: string, v: unknown) => (filters.push(['eq', c, v]), b),
      neq: (c: string, v: unknown) => (filters.push(['neq', c, v]), b),
      is: (c: string, v: unknown) => (filters.push(['is', c, v]), b),
      in: (c: string, v: unknown) => (filters.push(['in', c, v]), b),
      lte: (c: string, v: unknown) => (filters.push(['lte', c, v]), b),
      gte: (c: string, v: unknown) => (filters.push(['gte', c, v]), b),
      insert: (p: unknown) => ((op = 'insert'), (payload = p), b),
      update: (p: unknown) => ((op = 'update'), (payload = p), b),
      upsert: (p: unknown) => ((op = 'insert'), (payload = p), b),
      delete: () => ((op = 'delete'), b),
      single: () => {
        const r = exec();
        return Promise.resolve(r.length ? { data: r[0], error: null } : { data: null, error: { message: 'no rows' } });
      },
      maybeSingle: () => Promise.resolve({ data: exec()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: exec(), error: null }).then(res, rej)
    };
    return b;
  };

  return { db: { from, rpc: async () => ({ data: null, error: null }) } as any, tables };
}

// ─── The world: one item, its caretaker, a department head, the EAO ─────────

function seed(opts: { caretakerOnLeave: boolean }): Record<string, Row[]> {
  return {
    projects: [{ id: 'proj-ops', code: 'CAMPUS-OPS' }],
    resource_maintenance_schedules: [
      {
        id: 'sch-1',
        resource_id: 'res-1',
        maintenance_type: 'preventive',
        frequency_days: 30,
        next_maintenance_date: '2026-01-01',
        assigned_to_user_id: null,
        description: SEEDED_ROUTINE_CHECK_TEXTS[0],
        is_active: true
      }
    ],
    resources: [
      {
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
      }
    ],
    profiles: [
      { id: 'prof-caretaker', role: 'faculty', is_active: true, institution_id: 'inst-1' },
      { id: 'prof-head', role: 'hod', is_active: true, institution_id: 'inst-1' },
      { id: 'prof-eao', role: 'executive_admin_officer', is_active: true, institution_id: 'inst-1' }
    ],
    staff: [
      { id: 'staff-caretaker', profile_id: 'prof-caretaker', is_active: true, department_id: 'dept-1' },
      { id: 'staff-head', profile_id: 'prof-head', is_active: true, department_id: 'dept-1' },
      { id: 'staff-eao', profile_id: 'prof-eao', is_active: true, department_id: 'dept-2' }
    ],
    departments: [
      { id: 'dept-1', head_of_department_id: 'prof-head' },
      { id: 'dept-2', head_of_department_id: null }
    ],
    hr_leave_applications: opts.caretakerOnLeave
      ? [
          {
            id: 'leave-1',
            employee_id: 'staff-caretaker',
            status: 'approved',
            // Wide on purpose: the leave rule reads the real clock.
            start_date: '2000-01-01',
            end_date: '2999-12-31'
          }
        ]
      : [],
    project_tasks: [],
    project_task_assignees: [],
    resource_maintenance_logs: []
  };
}

beforeEach(() => {
  createBellNotification.mockReset();
  createBellNotification.mockResolvedValue(null);
});

describe('a routine check whose owner is on leave goes to their leave stand-in (Director, 1 Oct)', () => {
  it('owner on approved leave → the job, the history row and the bell go to the department head', async () => {
    const { db, tables } = memoryDb(seed({ caretakerOnLeave: true }));
    const r = await runRoutineChecks(db);

    expect(r.created).toBe(1);
    // The daily job still picked the caretaker as owner …
    expect(r.owner_via).toEqual({ caretaker: 1 });

    // … and createWalkTask's leave rule moved the job to the stand-in.
    const task = tables.project_tasks[0];
    expect(task.owner_staff_id).toBe('staff-head');
    expect(task.is_blocked).toBe(true); // clock paused for leave
    expect(task.metadata.routine_check).toBe(true);
    expect(task.metadata.blocked?.reason).toMatch(/approved leave/);

    const accountable = tables.project_task_assignees.filter((a) => a.role === 'accountable').map((a) => a.staff_id);
    expect(accountable).toEqual(['staff-head']);

    // The maintenance history row and the "check due" bell follow the stand-in.
    const log = tables.resource_maintenance_logs[0];
    expect(log.assigned_to_user_id).toBe('prof-head');
    const dueBell = createBellNotification.mock.calls
      .map((c) => c[1])
      .find((b) => b.category === 'campus-walk:routine-check');
    expect(dueBell.recipientIds).toEqual(['prof-head']);
  });

  it('owner not on leave → the job stays with the caretaker (control)', async () => {
    const { db, tables } = memoryDb(seed({ caretakerOnLeave: false }));
    const r = await runRoutineChecks(db);

    expect(r.created).toBe(1);
    const task = tables.project_tasks[0];
    expect(task.owner_staff_id).toBe('staff-caretaker');
    expect(task.is_blocked).toBe(false);
    expect(tables.resource_maintenance_logs[0].assigned_to_user_id).toBe('prof-caretaker');
    const dueBell = createBellNotification.mock.calls
      .map((c) => c[1])
      .find((b) => b.category === 'campus-walk:routine-check');
    expect(dueBell.recipientIds).toEqual(['prof-caretaker']);
  });
});
