import { describe, it, expect, vi, beforeEach } from 'vitest';

// Follow-up to the #4149 review, finding 4: the next-approver notice must not hold
// the approve response open. It is handed to Next's after() instead of awaited.

const afterCallbacks: (() => unknown)[] = [];
vi.mock('next/server', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/server')>();
  return {
    ...real,
    connection: async () => {},
    after: (cb: () => unknown) => {
      afterCallbacks.push(cb);
    },
  };
});
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'approver-1' } }, error: null }) },
  }),
}));
const approveCandidate = vi.fn();
vi.mock('@/lib/services/hr/recruitment-service', () => ({
  RecruitmentService: { approveCandidate: (...a: unknown[]) => approveCandidate(...a) },
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ service: true }) }));
const notifyNextApprover = vi.fn();
vi.mock('@/lib/hr/recruitment/harness-run', () => ({
  notifyNextApprover: (...a: unknown[]) => notifyNextApprover(...a),
}));

import { POST } from '@/lib/api/hr/recruitment/candidates/handlers/approve';

function call() {
  const request = { json: async () => ({ comment: 'ok' }) } as any;
  return POST(request, { params: Promise.resolve({ id: 'cand-1' }) });
}

/** Resolves to 'timeout' if the response is still held open after `ms`. */
function within<T>(p: Promise<T>, ms = 500): Promise<T | 'timeout'> {
  return Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);
}

beforeEach(() => {
  afterCallbacks.length = 0;
  approveCandidate.mockReset();
  notifyNextApprover.mockReset();
});

describe('approve route — the next-approver notice runs after the response', () => {
  it('responds even when the notice never finishes, and sends it from after()', async () => {
    approveCandidate.mockResolvedValue({ id: 'cand-1', status: 'pending_approval' });
    notifyNextApprover.mockReturnValue(new Promise(() => {})); // a database that never answers

    const res = await within(call());
    expect(res).not.toBe('timeout');
    expect((res as Response).status).toBe(200);
    expect(notifyNextApprover).not.toHaveBeenCalled();

    expect(afterCallbacks).toHaveLength(1);
    void afterCallbacks[0]();
    expect(notifyNextApprover).toHaveBeenCalledWith({ service: true }, 'cand-1', 'approver-1');
  });

  it('a notice that throws inside after() is caught', async () => {
    approveCandidate.mockResolvedValue({ id: 'cand-1', status: 'pending_approval' });
    notifyNextApprover.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(res.status).toBe(200);
    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('the last step (status approved) schedules no notice', async () => {
    approveCandidate.mockResolvedValue({ id: 'cand-1', status: 'approved' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(afterCallbacks).toHaveLength(0);
  });
});
