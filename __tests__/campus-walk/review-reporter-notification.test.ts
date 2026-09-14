// __tests__/campus-walk/review-reporter-notification.test.ts
// ============================================================================
// The one notification that closes InstaSolver's loop.
//
// The form tells a reporter "you'll get a notification here when it's marked
// fixed". Before this branch existed, nothing anywhere kept that promise: the
// fixer was told their photo was accepted, the Director could see the board,
// and the learner who photographed the exposed wire was never told it had been
// dealt with. A promise nothing keeps is worse than no promise — it teaches
// people that reporting is pointless, which costs more than the form earns.
//
// Every assertion here is about a way this could go wrong QUIETLY:
//   - fire on `request_changes` -> the reporter is told "fixed" when it is not,
//     and learns how a named department's fix is going (a D10 leak);
//   - fire without an idempotency key -> a reopened-and-re-approved task, or
//     two reviewers racing, pings the reporter again and again;
//   - fire on a task with no `reporter_id` -> a crash, or a notification to
//     nobody, on every ordinary Campus Walk closure;
//   - name the fixer in the body -> the D10 breach the whole lane is built to
//     avoid.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const createBellNotification = vi.fn();

/** The task row the route reads. Mutated per test. */
let taskRow: Record<string, any>;

function makeAdminClient() {
  return {
    from: (table: string) => {
      if (table === 'project_tasks') {
        return {
          select: () => ({
            eq: () => ({
              // The post-update re-read path is never reached in these tests.
              maybeSingle: async () => ({ data: taskRow, error: null }),
              eq: () => ({ select: async () => ({ data: [{ id: taskRow.id }], error: null }) }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({ select: async () => ({ data: [{ id: taskRow.id }], error: null }) }),
            }),
          }),
        };
      }
      if (table === 'staff' || table === 'project_task_assignees' || table === 'profiles') {
        // resolveFixerProfileId's lookups — deliberately empty, so the FIXER
        // notification is skipped and only the reporter branch is exercised.
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              order: () => ({ limit: async () => ({ data: [], error: null }) }),
              in: async () => ({ data: [], error: null }),
            }),
            in: async () => ({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected admin table ${table}`);
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceRoleClient: () => makeAdminClient(),
}));

vi.mock('@/lib/campus-walk/reporters', () => ({
  isCampusWalkReporter: async () => true,
}));

vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...args: unknown[]) => createBellNotification(...args),
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/campus-walk/review/route');
  const request = { json: async () => body } as unknown as Parameters<typeof POST>[0];
  return POST(request);
}

/** A job sitting in review, awaiting the approval that closes it. */
function awaitingApproval(extraMetadata: Record<string, any> = {}) {
  return {
    id: 'task-1',
    project_id: 'proj-1',
    title: 'Block A washroom — the tap will not turn off',
    status_key: 'review',
    owner_staff_id: null,
    completed_at: null,
    metadata: {
      source: 'campus-walk',
      fix: { submitted_at: '2026-09-13T08:00:00.000Z', approval: { state: 'awaiting_approval' } },
      ...extraMetadata,
    },
  };
}

/** The reporter notification, if one was sent. */
function reporterCall() {
  return createBellNotification.mock.calls.find(
    (c) => (c[1] as any)?.category === 'instasolver:reported-fixed'
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createBellNotification.mockResolvedValue('notif-1');
  getUser.mockResolvedValue({ data: { user: { id: 'reviewer-1', email: 'd@jkkn.ac.in' } } });
  taskRow = awaitingApproval({ reporter_id: 'learner-1', front_door: 'instasolver' });
});

describe('the reporter is told when their report is verified fixed', () => {
  it('sends exactly one notice, to the reporter, under a per-task idempotency key', async () => {
    const res = await post({ task_id: 'task-1', decision: 'approve' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reporter_notified).toBe(true);

    const call = reporterCall();
    expect(call).toBeDefined();
    const opts = call![1] as any;
    expect(opts.recipientIds).toEqual(['learner-1']);
    // The database, not a read-then-write check, is what makes this once-only.
    expect(opts.idempotencyKey).toBe('instasolver-fixed:task-1');
  });

  it('names no person in the title or the body (D10)', async () => {
    await post({ task_id: 'task-1', decision: 'approve' });

    const opts = reporterCall()![1] as any;
    const text = `${opts.title} ${opts.body}`;
    expect(text).not.toContain('reviewer-1');
    expect(text).not.toContain('Director');
    // createdBy is the recipient themselves, so no other name can surface as
    // "From:" on any notification surface that renders it.
    expect(opts.createdBy).toBe('learner-1');
  });

  it('treats an already-sent notice as success, not failure', async () => {
    // createBellNotification returns null when the idempotency index already
    // holds one. The reporter HAS been told; reporting that as a failure would
    // send someone chasing a notification that was correctly suppressed.
    createBellNotification.mockResolvedValue(null);

    const res = await post({ task_id: 'task-1', decision: 'approve' });
    const body = await res.json();

    expect(body.reporter_notified).toBe(true);
    expect(reporterCall()).toBeDefined();
  });

  it('says nothing to the reporter when changes are requested', async () => {
    // Not fixed yet. Telling them "fixed" would be false, and telling them
    // "sent back" would leak how a named department's fix is going.
    const res = await post({
      task_id: 'task-1',
      decision: 'request_changes',
      note: 'The photo does not show the tap closed — please retake it.',
    });

    expect(res.status).toBe(200);
    expect(reporterCall()).toBeUndefined();
  });

  it('does nothing at all for an ordinary walk observation with no reporter', async () => {
    // Every Campus Walk closure takes this path. It must not crash, and must
    // not notify anyone.
    taskRow = awaitingApproval();

    const res = await post({ task_id: 'task-1', decision: 'approve' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reporter_notified).toBeNull();
    expect(reporterCall()).toBeUndefined();
  });

  it('does not ping a reviewer who is closing their own report', async () => {
    taskRow = awaitingApproval({ reporter_id: 'reviewer-1', front_door: 'instasolver' });

    const res = await post({ task_id: 'task-1', decision: 'approve' });
    const body = await res.json();

    expect(body.reporter_notified).toBeNull();
    expect(reporterCall()).toBeUndefined();
  });
});
