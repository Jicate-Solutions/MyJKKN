// __tests__/campus-walk/not-fixed-route.test.ts
// ============================================================================
// app/api/campus-walk/not-fixed/route.ts — the reporter's "Not fixed" button.
//
// project_* RLS lets ANY signed-in account write any task row, so this route's
// own gate is the whole boundary. Pinned here:
//   - only the recorded reporter may reopen (anyone else is refused, in words);
//   - only a job that is actually closed, and only for 7 days after;
//   - a reopen is the SAME job back in progress with a fresh due date of the
//     same length, the chase-up ladder re-armed for a new round, and the
//     people who fix it told — never a recurrence.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeDb, filterOf, type RecordedQuery } from './fake-db';

const getUser = vi.fn();
const createBellNotification = vi.fn();
let fake: ReturnType<typeof makeFakeDb>;
let taskRow: Record<string, any> | null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceRoleClient: () => fake.db,
}));

vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...args: unknown[]) => createBellNotification(...args),
}));

const DAY = 86_400_000;

function respond(q: RecordedQuery) {
  if (q.table === 'project_tasks' && q.op === 'select') return { data: taskRow };
  if (q.table === 'project_tasks' && q.op === 'update') return { data: [{ id: 'task-1' }] };
  if (q.table === 'project_task_assignees') return { data: { staff_id: 'acc-staff-1' } };
  if (q.table === 'staff') return { data: { profile_id: 'accountable-1' } };
  return { data: null };
}

function closedTask(daysAgo = 1, extra: Record<string, any> = {}) {
  return {
    id: 'task-1',
    title: 'Block A washroom — the tap will not turn off',
    status_key: 'done',
    owner_staff_id: 'acc-staff-1',
    completed_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
    due_date: '2026-09-20',
    metadata: {
      source: 'campus-walk',
      front_door: 'instasolver',
      kind: 'symptom',
      unsafe: false,
      reporter_id: 'learner-1',
      raised_by_profile_id: 'learner-1',
      campus_walk_chase: { rungs_sent: { reminder_1: '2026-09-21T00:00:00Z' }, last_run_at: 'x' },
      fix: {
        submitted_by_profile_id: 'fixer-1',
        attachment_id: 'att-9',
        approval: { state: 'approved', auto: true, note: null },
      },
      ...extra,
    },
  };
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/campus-walk/not-fixed/route');
  const request = { json: async () => body } as unknown as Parameters<typeof POST>[0];
  return POST(request);
}

function updateQuery() {
  return fake.queries.find((q) => q.table === 'project_tasks' && q.op === 'update');
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeDb(respond);
  createBellNotification.mockResolvedValue('notif-1');
  getUser.mockResolvedValue({ data: { user: { id: 'learner-1' } } });
  taskRow = closedTask();
});

describe('the gate', () => {
  it('refuses a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await post({ taskId: 'task-1' });
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });

  it('refuses anyone who is not the reporter, and writes nothing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'someone-else' } } });
    const res = await post({ taskId: 'task-1' });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toMatchObject({ success: false, code: 'not_reporter' });
    expect(body.error).toMatch(/Only the person who reported this/);
    expect(updateQuery()).toBeUndefined();
  });

  it('refuses a job that is not closed', async () => {
    taskRow = { ...closedTask(), status_key: 'in_progress', completed_at: null };
    const res = await post({ taskId: 'task-1' });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('not_done');
    expect(updateQuery()).toBeUndefined();
  });

  it('refuses once more than 7 days have passed since it was fixed', async () => {
    taskRow = closedTask(8);
    const res = await post({ taskId: 'task-1' });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('window_closed');
    expect(body.error).toMatch(/more than 7 days/);
    expect(updateQuery()).toBeUndefined();
  });

  it('refuses a task that is not a Campus Walk job', async () => {
    taskRow = closedTask(1, { source: 'projects' });
    const res = await post({ taskId: 'task-1' });
    expect(res.status).toBe(400);
    expect(updateQuery()).toBeUndefined();
  });

  it('answers a double tap as already done, without writing again', async () => {
    taskRow = {
      ...closedTask(),
      status_key: 'in_progress',
      completed_at: null,
      metadata: {
        ...closedTask().metadata,
        fix: { approval: { state: 'changes_requested', reopened_by_reporter: true } },
      },
    };
    const res = await post({ taskId: 'task-1' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, already: true });
    expect(updateQuery()).toBeUndefined();
  });
});

describe('a reopen', () => {
  it('puts the SAME job back in progress with a fresh due date and re-armed reminders', async () => {
    const res = await post({ taskId: 'task-1', note: 'Still dripping' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const upd = updateQuery()!;
    // Compare-and-set: only a job that is still closed is reopened.
    expect(filterOf(upd, 'id')).toBe('task-1');
    expect(filterOf(upd, 'status_key')).toBe('done');

    const expectedDue = new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10);
    expect(upd.payload).toMatchObject({
      status_key: 'in_progress',
      completed_at: null,
      due_date: expectedDue,
      is_overdue: false,
      is_blocked: false,
    });
    expect(upd.payload.metadata.fix.approval).toMatchObject({
      state: 'changes_requested',
      reopened_by_reporter: true,
      previous_state: 'approved',
      note: 'Still dripping',
      decided_by_profile_id: 'learner-1',
    });
    // The chase-up reset: rungs cleared AND a new round, so the keys change.
    expect(upd.payload.metadata.campus_walk_chase).toMatchObject({ rungs_sent: {}, round: 1 });
    expect(upd.payload.metadata.reopens).toHaveLength(1);
    // Not a recurrence: D7's occurrence counter is untouched.
    expect(upd.payload.metadata.occurrences).toBeUndefined();
  });

  it('bumps the round again on a second reopen', async () => {
    taskRow = closedTask(1, { campus_walk_chase: { rungs_sent: {}, round: 1 } });
    await post({ taskId: 'task-1' });
    expect(updateQuery()!.payload.metadata.campus_walk_chase.round).toBe(2);
  });

  it('gives an unsafe job the same-day clock it first had', async () => {
    taskRow = closedTask(1, { unsafe: true });
    await post({ taskId: 'task-1' });
    expect(updateQuery()!.payload.due_date).toBe(new Date().toISOString().slice(0, 10));
  });

  it('tells the people who fix it, without naming the reporter', async () => {
    await post({ taskId: 'task-1', note: 'Still dripping' });

    const call = createBellNotification.mock.calls.find((c) => (c[1] as any)?.category === 'campus-walk:not-fixed');
    expect(call).toBeDefined();
    const opts = call![1] as any;
    expect(opts.recipientIds.sort()).toEqual(['accountable-1', 'fixer-1']);
    expect(opts.idempotencyKey).toBe('campus-walk-not-fixed:task-1:r1');
    expect(opts.url).toBe('/campus-walk/fix?task=task-1');
    expect(`${opts.title} ${opts.body}`).not.toContain('learner-1');
  });
});
