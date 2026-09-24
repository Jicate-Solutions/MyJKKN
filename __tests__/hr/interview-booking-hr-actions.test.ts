// The HR side of the interview booking link: the call-back list (#14) and the
// list of interviews booked for posts that are no longer open (#13).

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = [string, unknown[]];
type Result = { data: unknown; error: unknown };

/**
 * A session-client double. Each from() starts a chain that records every call;
 * awaiting the chain asks `resolve(table, calls)` for the result.
 */
function fakeClient(opts: {
  resolve: (table: string, calls: Call[]) => Result;
  rpc?: Record<string, unknown>;
  userId?: string | null;
}) {
  const chains: Array<{ table: string; calls: Call[] }> = [];
  const rpcCalls: Array<[string, unknown]> = [];
  const client = {
    from(table: string) {
      const rec = { table, calls: [] as Call[] };
      chains.push(rec);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'update', 'gte', 'not', 'in']) {
        chain[m] = (...args: unknown[]) => {
          rec.calls.push([m, args]);
          return chain;
        };
      }
      chain.then = (ok: (r: Result) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(opts.resolve(table, rec.calls)).then(ok, bad);
      return chain;
    },
    rpc(name: string, args?: unknown) {
      rpcCalls.push([name, args]);
      const key = name === 'user_has_permission' ? `perm:${(args as { permission_name: string }).permission_name}` : name;
      return Promise.resolve({ data: opts.rpc?.[key] ?? false, error: null });
    },
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: opts.userId === null ? null : { id: opts.userId ?? 'u-hr' } } }),
    },
  };
  return { client, chains, rpcCalls };
}

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => state.client }));

import {
  loadCallbackRequests,
  loadClosedPostInterviews,
  markCallbackRequestCalled,
  reopenCallbackRequest,
} from '@/app/(routes)/hr/recruitment/interviews/interview-booking-hr-actions';

const has = (calls: Call[], m: string, ...args: unknown[]) =>
  calls.some(([name, a]) => name === m && JSON.stringify(a.slice(0, args.length)) === JSON.stringify(args));
const updatePayload = (calls: Call[]) => calls.find(([m]) => m === 'update')?.[1][0] as Record<string, unknown>;

beforeEach(() => {
  state.client = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('loadCallbackRequests (#14)', () => {
  it('reads open requests oldest first, and only the latest 20 handled ones', async () => {
    const f = fakeClient({
      resolve: (_t, calls) =>
        has(calls, 'eq', 'status', 'open')
          ? { data: [{ id: 'o1', handler: null }], error: null }
          : { data: [{ id: 'd1', handler: { full_name: 'Priya' } }], error: null },
    });
    state.client = f.client;
    const res = await loadCallbackRequests();

    expect(f.chains.every((c) => c.table === 'hr_interview_callback_requests')).toBe(true);
    const open = f.chains.find((c) => has(c.calls, 'eq', 'status', 'open'))!;
    expect(has(open.calls, 'order', 'created_at', { ascending: true })).toBe(true);
    const done = f.chains.find((c) => has(c.calls, 'eq', 'status', 'done'))!;
    expect(has(done.calls, 'order', 'handled_at', { ascending: false, nullsFirst: false })).toBe(true);
    expect(has(done.calls, 'limit', 20)).toBe(true);

    expect(res.success).toBe(true);
    if (res.success === false) return;
    expect(res.open.map((r) => r.id)).toEqual(['o1']);
    expect(res.done[0].handler_name).toBe('Priya');
  });

  it('a refused read is a failure (the card hides), not an empty list', async () => {
    state.client = fakeClient({
      resolve: () => ({ data: null, error: { message: 'permission denied' } }),
    }).client;
    const res = await loadCallbackRequests();
    expect(res.success).toBe(false);
  });
});

describe('markCallbackRequestCalled', () => {
  it('sends ONLY status, handled_by, handled_at and the note — guarded on status open', async () => {
    const f = fakeClient({ resolve: () => ({ data: [{ id: 'r1' }], error: null }) });
    state.client = f.client;
    const res = await markCallbackRequestCalled('r1', '  Booked for Tue 11am ');
    expect(res).toEqual({ success: true });

    const calls = f.chains[0].calls;
    const patch = updatePayload(calls);
    expect(Object.keys(patch).sort()).toEqual(['handled_at', 'handled_by', 'outcome_note', 'status']);
    expect(patch.status).toBe('done');
    expect(patch.handled_by).toBe('u-hr');
    expect(patch.outcome_note).toBe('Booked for Tue 11am');
    expect(typeof patch.handled_at).toBe('string');
    expect(has(calls, 'eq', 'id', 'r1')).toBe(true);
    expect(has(calls, 'eq', 'status', 'open')).toBe(true);
  });

  it('an empty note is not written, so it never wipes an earlier one', async () => {
    const f = fakeClient({ resolve: () => ({ data: [{ id: 'r1' }], error: null }) });
    state.client = f.client;
    await markCallbackRequestCalled('r1', '   ');
    expect('outcome_note' in updatePayload(f.chains[0].calls)).toBe(false);
  });

  it('no edit permission → the explicit access message', async () => {
    state.client = fakeClient({ resolve: () => ({ data: [], error: null }), rpc: {} }).client;
    const res = await markCallbackRequestCalled('r1', '');
    expect(res).toEqual({
      success: false,
      error: "You don't have access to update call-back requests — contact the HR admin.",
    });
  });

  it('has the permission but no row changed → someone updated it first', async () => {
    state.client = fakeClient({
      resolve: () => ({ data: [], error: null }),
      rpc: { 'perm:hr.recruitment.edit': true },
    }).client;
    const res = await markCallbackRequestCalled('r1', '');
    expect(res).toEqual({ success: false, error: 'This request was already updated — refresh.' });
  });

  it('an admin without the permission key is never told they lack access', async () => {
    state.client = fakeClient({ resolve: () => ({ data: [], error: null }), rpc: { is_admin: true } }).client;
    const res = await markCallbackRequestCalled('r1', '');
    expect(res).toEqual({ success: false, error: 'This request was already updated — refresh.' });
  });

  it('signed out → the access message, and nothing is written', async () => {
    const f = fakeClient({ resolve: () => ({ data: [{ id: 'r1' }], error: null }), userId: null });
    state.client = f.client;
    const res = await markCallbackRequestCalled('r1', '');
    expect(res.success).toBe(false);
    expect(f.chains).toHaveLength(0);
  });
});

describe('reopenCallbackRequest', () => {
  it('sets status open and clears the handled fields, guarded on status done', async () => {
    const f = fakeClient({ resolve: () => ({ data: [{ id: 'r1' }], error: null }) });
    state.client = f.client;
    const res = await reopenCallbackRequest('r1');
    expect(res).toEqual({ success: true });
    const calls = f.chains[0].calls;
    expect(updatePayload(calls)).toEqual({
      status: 'open',
      handled_at: null,
      handled_by: null,
      closed_by_booking_id: null,
    });
    expect(has(calls, 'eq', 'status', 'done')).toBe(true);
  });

  it('refused → the explicit access message', async () => {
    state.client = fakeClient({ resolve: () => ({ data: [], error: null }) }).client;
    const res = await reopenCallbackRequest('r1');
    expect(res.success === false && res.error).toMatch(/don't have access/);
  });
});

describe('loadClosedPostInterviews (#13)', () => {
  it('asks only for FUTURE SCHEDULED interviews, then only filled/closed posts, and keeps just those', async () => {
    const f = fakeClient({
      resolve: (table) =>
        table === 'hr_recruitment_interviews'
          ? {
              data: [
                { id: 'i1', job_id: 'j-filled', scheduled_at: '2026-10-01T05:30:00Z', round_number: 2, round_name: 'Panel', candidate: { name: 'Anitha' } },
                { id: 'i2', job_id: 'j-open', scheduled_at: '2026-10-02T05:30:00Z', round_number: 1, round_name: null, candidate: { name: 'Babu' } },
              ],
              error: null,
            }
          : { data: [{ id: 'j-filled', title: 'Accounts Officer', status: 'filled' }], error: null },
    });
    state.client = f.client;
    const before = Date.now();
    const res = await loadClosedPostInterviews();

    const iv = f.chains.find((c) => c.table === 'hr_recruitment_interviews')!.calls;
    expect(has(iv, 'eq', 'status', 'scheduled')).toBe(true);
    const gte = iv.find(([m]) => m === 'gte')!;
    expect(gte[1][0]).toBe('scheduled_at');
    expect(new Date(gte[1][1] as string).getTime()).toBeGreaterThanOrEqual(before - 1000);

    const jobs = f.chains.find((c) => c.table === 'hr_recruitment_jobs')!.calls;
    expect(has(jobs, 'in', 'id', ['j-filled', 'j-open'])).toBe(true);
    expect(has(jobs, 'in', 'status', ['filled', 'closed'])).toBe(true);

    expect(res).toEqual({
      success: true,
      rows: [
        {
          id: 'i1', candidate_name: 'Anitha', job_id: 'j-filled', post_title: 'Accounts Officer',
          post_status: 'filled', scheduled_at: '2026-10-01T05:30:00Z', round_number: 2, round_name: 'Panel',
        },
      ],
    });
  });

  it('no upcoming interviews → no post query at all', async () => {
    const f = fakeClient({ resolve: () => ({ data: [], error: null }) });
    state.client = f.client;
    expect(await loadClosedPostInterviews()).toEqual({ success: true, rows: [] });
    expect(f.chains.map((c) => c.table)).toEqual(['hr_recruitment_interviews']);
  });
});
