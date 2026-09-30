// __tests__/campus-walk/fix-route-closes.test.ts
// ============================================================================
// app/api/campus-walk/fix/route.ts — `submit` now CLOSES the job.
//
// Director's ruling, 2026-09-30 (supersedes spec D4): the fixer's after-photo
// closes the job at once, no approval queue. Pinned here:
//   - a submit records the photo AND ends with the job 'done' + approved;
//   - the close is a compare-and-set from the 'review' the route just wrote;
//   - if the close write fails, the photo is still recorded and the answer
//     says so honestly (the job waits for a manager instead);
//   - the done-guard: the SAME photo again on a closed job is a retry and
//     rings nothing; a DIFFERENT photo on a closed job is refused and nothing
//     is uploaded.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { makeFakeDb, filterOf, type RecordedQuery } from './fake-db';

const getUser = vi.fn();
const createBellNotification = vi.fn();
let fake: ReturnType<typeof makeFakeDb>;
let taskRow: Record<string, any>;
let closeFails = false;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceRoleClient: () => fake.db,
}));
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...args: unknown[]) => createBellNotification(...args),
}));
vi.mock('@/lib/services/director-desk/handover-chase-service', () => ({
  resolveDirectors: vi.fn(),
  validateTargeting: vi.fn(),
}));
// The JPEG cleaning is covered by its own tests; here it is a pass-through so
// the stored path is predictable from the bytes the test sends.
vi.mock('@/lib/services/pde/jpeg-metadata', () => ({
  isJpegMagic: () => true,
  stripJpegMetadata: (b: Uint8Array) => b,
  scanJpegForMetadata: () => ({ ok: true }),
}));

const PHOTO = new Uint8Array(4096).fill(7);
const PHOTO_PATH = `task-1/fix/${createHash('sha256').update(PHOTO).digest('hex')}.jpg`;

function respond(q: RecordedQuery) {
  if (q.table === 'project_tasks' && q.op === 'select' && q.terminal === 'maybeSingle') return { data: taskRow };
  if (q.table === 'project_tasks' && q.op === 'update') {
    if (q.payload.status_key === 'done') {
      return closeFails ? { error: { message: 'boom' } } : { data: [{ id: 'task-1' }] };
    }
    return { data: null };
  }
  if (q.table === 'staff' && q.terminal === 'many') {
    return { data: [{ id: 'staff-1', first_name: 'Ravi', last_name: 'K', department_id: null, is_active: true }] };
  }
  if (q.table === 'project_task_assignees') return { data: { staff_id: 'staff-1' } };
  if (q.table === 'project_task_attachments' && q.op === 'insert') return { data: { id: 'att-2', version: 2 } };
  if (q.table === 'project_task_attachments') return { data: [{ id: 'att-1', version: 1, storage_path: 'task-1/obs.jpg', is_final_report: false, created_at: 'x' }] };
  return { data: null };
}

function openTask(extra: Record<string, any> = {}) {
  return {
    id: 'task-1',
    project_id: 'proj-1',
    title: 'Block A washroom — the tap will not turn off',
    description: null,
    due_date: '2026-10-02',
    status_key: 'in_progress',
    is_blocked: false,
    is_overdue: false,
    owner_staff_id: 'staff-1',
    completed_at: null,
    metadata: {
      source: 'campus-walk',
      front_door: 'instasolver',
      reporter_id: 'learner-1',
      raised_by_profile_id: 'learner-1',
      photo_storage_path: 'task-1/obs.jpg',
      ...extra,
    },
  };
}

async function submit() {
  const { POST } = await import('@/app/api/campus-walk/fix/route');
  const fd = new FormData();
  fd.set('task_id', 'task-1');
  fd.set('action', 'submit');
  fd.set('photo', new Blob([PHOTO], { type: 'image/jpeg' }), 'fix.jpg');
  const request = { formData: async () => fd } as unknown as Parameters<typeof POST>[0];
  return POST(request);
}

function taskUpdates() {
  return fake.queries.filter((q) => q.table === 'project_tasks' && q.op === 'update');
}

beforeEach(() => {
  vi.clearAllMocks();
  closeFails = false;
  fake = makeFakeDb(respond);
  createBellNotification.mockResolvedValue('notif-1');
  getUser.mockResolvedValue({ data: { user: { id: 'fixer-1' } } });
  taskRow = openTask();
});

describe('the fix photo closes the job', () => {
  it('records the photo, then closes the job as approved under a compare-and-set', async () => {
    const res = await submit();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, closed: true, status_key: 'done', approval_state: 'approved' });
    expect(body.message).toMatch(/closed/);

    const [record, close] = taskUpdates();
    expect(record.payload.status_key).toBe('review');
    expect(record.payload.metadata.fix.storage_path).toBe(PHOTO_PATH);
    expect(close.payload.status_key).toBe('done');
    expect(close.payload.completed_at).toEqual(expect.any(String));
    expect(close.payload.metadata.fix.approval).toMatchObject({ state: 'approved', auto: true });
    expect(filterOf(close, 'status_key')).toBe('review');
  });

  it('tells the reporter, and not the fixer about their own work', async () => {
    await submit();

    const categories = createBellNotification.mock.calls.map((c) => (c[1] as any).category);
    expect(categories).toContain('instasolver:reported-fixed');
    expect(categories).not.toContain('campus-walk:approved');
    const reporter = createBellNotification.mock.calls.find(
      (c) => (c[1] as any).category === 'instasolver:reported-fixed'
    )![1] as any;
    expect(reporter.idempotencyKey).toBe('instasolver-fixed:task-1:att-2');
  });

  it('keeps the photo and says so honestly when the close write fails', async () => {
    closeFails = true;
    const res = await submit();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, closed: false, status_key: 'review' });
    expect(body.message).toMatch(/photo is saved/);
    expect(taskUpdates()[0].payload.metadata.fix.storage_path).toBe(PHOTO_PATH);
  });
});

describe('the done-guard', () => {
  function closedWith(path: string) {
    return {
      ...openTask({
        fix: { storage_path: path, attachment_id: 'att-2', approval: { state: 'approved', auto: true } },
      }),
      status_key: 'done',
      completed_at: '2026-09-30T08:00:00.000Z',
    };
  }

  it('answers the same photo again as already closed, and writes and rings nothing', async () => {
    taskRow = closedWith(PHOTO_PATH);
    const res = await submit();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, already: true, closed: true });
    expect(taskUpdates()).toHaveLength(0);
    expect(fake.uploads).toHaveLength(0);
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('refuses a different photo on a closed job, before anything is uploaded', async () => {
    taskRow = closedWith('task-1/fix/some-other-photo.jpg');
    const res = await submit();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ ok: false, code: 'already_closed' });
    expect(body.error).toMatch(/Not fixed/);
    expect(taskUpdates()).toHaveLength(0);
    expect(fake.uploads).toHaveLength(0);
  });
});
