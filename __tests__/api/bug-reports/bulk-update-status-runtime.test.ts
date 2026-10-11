/**
 * POST /api/bug-reports/bulk-update-status, run for real against a mocked
 * Supabase client (not a source regex). The cascade, the resolution emails and
 * the counts must all follow from the rows the update actually changed, which
 * come back through updateWithResolvedBy's .select('id') data, on its first
 * try and on its retry without resolved_by alike. Nothing changed: no cascade
 * query at all (an empty .in('duplicate_of', []) is never sent), no email.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { table: string; op: string; args: unknown[] };

const state = {
  calls: [] as Call[],
  changed: [] as { id: string }[],
  children: [] as { id: string }[],
  // first update errors as a database without resolved_by would
  missingResolvedBy: false,
  updateAttempts: 0,
  emailIds: [] as string[],
};

function builder(table: string) {
  const ops: { op: string; args: unknown[] }[] = [];
  const b: Record<string, any> = {};
  for (const op of ['select', 'update', 'in', 'neq', 'eq', 'insert']) {
    b[op] = (...args: unknown[]) => {
      ops.push({ op, args });
      state.calls.push({ table, op, args });
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) => {
    const isUpdate = ops.some((o) => o.op === 'update');
    if (table === 'bug_reports' && isUpdate) {
      const payload = ops.find((o) => o.op === 'update')!.args[0] as Record<string, unknown>;
      const isCascade = ops.some((o) => o.op === 'in' && (o.args[1] as string[]).includes('child-1'));
      if (isCascade) return Promise.resolve({ data: null, error: null }).then(resolve);
      state.updateAttempts++;
      if (state.missingResolvedBy && 'resolved_by' in payload) {
        return Promise.resolve({
          data: null,
          error: { code: '42703', message: 'column "resolved_by" does not exist' },
        }).then(resolve);
      }
      return Promise.resolve({ data: state.changed, error: null }).then(resolve);
    }
    if (table === 'bug_reports') return Promise.resolve({ data: state.children, error: null }).then(resolve);
    if (table === 'bug_reports_with_details') {
      const ids = ops.find((o) => o.op === 'in')!.args[1] as string[];
      state.emailIds = ids;
      return Promise.resolve({
        data: ids.map((id) => ({ id, reporter_email: `${id}@jkkn.ac.in`, display_id: id })),
        error: null,
      }).then(resolve);
    }
    return Promise.resolve({ data: null, error: null }).then(resolve);
  };
  return b;
}

vi.mock('next/server', async (orig) => ({ ...(await orig<object>()), connection: async () => {} }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { role: 'super_admin', is_super_admin: true }, error: null }) }),
      }),
    }),
  })),
}));

vi.mock('@/lib/supabase/client', () => ({
  createAdminClient: vi.fn(() => ({ from: (t: string) => builder(t) })),
}));

const sendBulk = vi.fn(async (list: unknown[]) => ({ sent: list.length, failed: 0, skipped: 0 }));
vi.mock('@/lib/services/email/bug-report-email-service', () => ({
  BugReportEmailService: { sendBulkResolvedEmails: (list: unknown[]) => sendBulk(list) },
}));

import { POST } from '@/app/api/bug-reports/bulk-update-status/route';

const call = (status: string, reportIds = ['bug-1', 'bug-2', 'bug-3']) =>
  POST(
    new Request('https://www.jkkn.ai/api/bug-reports/bulk-update-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reportIds, status }),
    })
  );
const flush = () => new Promise((r) => setTimeout(r, 0));
const cascadeLookups = () =>
  state.calls.filter((c) => c.table === 'bug_reports' && c.op === 'in' && c.args[0] === 'duplicate_of');

beforeEach(() => {
  state.calls = [];
  state.changed = [];
  state.children = [];
  state.missingResolvedBy = false;
  state.updateAttempts = 0;
  state.emailIds = [];
  sendBulk.mockClear();
});

describe('bulk-update-status at runtime', () => {
  it('resolving cascades from, emails and counts exactly the rows the update changed', async () => {
    state.changed = [{ id: 'bug-1' }, { id: 'bug-2' }]; // bug-3 was unverified: skipped by the update
    state.children = [{ id: 'child-1' }];
    const res = await call('resolved');
    const json = await res.json();
    await flush();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ updatedCount: 2, cascadedCount: 1 });
    expect(cascadeLookups()).toHaveLength(1);
    expect(cascadeLookups()[0].args[1]).toEqual(['bug-1', 'bug-2']);
    expect(state.emailIds).toEqual(['bug-1', 'bug-2', 'child-1']);
    expect(sendBulk).toHaveBeenCalledTimes(1);
    // the update itself skipped quarantined rows
    expect(state.calls).toContainEqual({ table: 'bug_reports', op: 'neq', args: ['status', 'unverified'] });
  });

  it('the retry without resolved_by passes its changed rows through too', async () => {
    state.missingResolvedBy = true;
    state.changed = [{ id: 'bug-1' }];
    const json = await (await call('resolved')).json();
    await flush();
    expect(state.updateAttempts).toBe(2);
    expect(json.updatedCount).toBe(1);
    expect(cascadeLookups()[0].args[1]).toEqual(['bug-1']);
    expect(state.emailIds).toEqual(['bug-1']);
  });

  it('nothing changed: no cascade query, no email, 0 updated', async () => {
    state.changed = [];
    const json = await (await call('resolved')).json();
    await flush();
    expect(json).toMatchObject({ updatedCount: 0, cascadedCount: 0 });
    expect(cascadeLookups()).toHaveLength(0);
    expect(sendBulk).not.toHaveBeenCalled();
  });

  it("wont_fix cascades but sends no email; 'unverified' is never a target", async () => {
    state.changed = [{ id: 'bug-1' }];
    state.children = [{ id: 'child-1' }];
    const json = await (await call('wont_fix')).json();
    await flush();
    expect(json.cascadedCount).toBe(1);
    expect(sendBulk).not.toHaveBeenCalled();
    expect((await call('unverified')).status).toBe(400);
  });
});
