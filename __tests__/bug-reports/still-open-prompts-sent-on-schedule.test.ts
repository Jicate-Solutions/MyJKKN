// ============================================================================
// The hourly notification job must queue and send "still happening?" prompts.
//
// fn_bug_stale_prompt_send was only ever run by hand (16-17 Sep 2026), so once
// a reporter's first three prompts were answered or expired, the rest of their
// queue (183 prompts across 25 reporters on 30 Sep) never went out — and a
// report nobody is asked about can never close. The job already calls the
// silence sweep (fn_bug_still_open_expire); the sender must run right after
// it, so slots freed by expiry are refilled in the same run.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

let rpcCalls: { name: string; args: unknown }[] = [];
// Every query-builder call, grouped per .from(table) query.
let queries: { table: string; calls: [string, unknown[]][] }[] = [];

// A chain that accepts any query-builder call and resolves to empty rows.
function chain(q?: { table: string; calls: [string, unknown[]][] }): unknown {
  const target = () => undefined;
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      }
      return (...args: unknown[]) => {
        q?.calls.push([String(prop), args]);
        return chain(q);
      };
    },
    apply() {
      return chain(q);
    },
  });
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const q = { table, calls: [] as [string, unknown[]][] };
      queries.push(q);
      return chain(q);
    },
    rpc: async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args });
      if (name === 'fn_bug_stale_prompt_prepare') {
        return { data: { success: true, prepared: 7 }, error: null };
      }
      if (name === 'fn_bug_stale_prompt_send') {
        return { data: { success: true, sent: 4, notified: 2 }, error: null };
      }
      if (name === 'fn_bug_still_open_expire') {
        return { data: { success: true, expired: 5, closed: 3, expired_unseen: 2 }, error: null };
      }
      return { data: null, error: null };
    },
  }),
}));

vi.mock('@/lib/push/opt-out', () => ({ filterPushRecipients: async (_c: unknown, ids: string[]) => ids }));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => {} } }));

beforeEach(() => {
  rpcCalls = [];
  queries = [];
  process.env.CRON_SECRET = 'test-secret';
});

describe('notification-processor: queued still-open prompts', () => {
  it('sends queued prompts right after the silence sweep, and reports how many', async () => {
    const { GET } = await import('@/app/api/cron/notification-processor/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/cron/notification-processor', {
      headers: { authorization: 'Bearer test-secret' },
    });

    const res = await GET(req);
    const body = await res.json();

    const names = rpcCalls.map((c) => c.name);
    const expireAt = names.indexOf('fn_bug_still_open_expire');
    const sendAt = names.indexOf('fn_bug_stale_prompt_send');

    expect(sendAt).toBeGreaterThan(-1);
    expect(expireAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(expireAt);
    expect(rpcCalls[sendAt].args).toEqual({ p_limit: 200 });
    expect(res.status).toBe(200);
    expect(body.bug_feedback_still_open_sent).toBe(4);
  });

  it('queues prompts for old ungrouped reports (60 days) before sending', async () => {
    const { GET } = await import('@/app/api/cron/notification-processor/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/cron/notification-processor', {
      headers: { authorization: 'Bearer test-secret' },
    });

    const res = await GET(req);
    const body = await res.json();

    const names = rpcCalls.map((c) => c.name);
    const prepAt = names.indexOf('fn_bug_stale_prompt_prepare');
    const sendAt = names.indexOf('fn_bug_stale_prompt_send');

    expect(prepAt).toBeGreaterThan(-1);
    expect(prepAt).toBeLessThan(sendAt);
    expect(rpcCalls[prepAt].args).toEqual({ p_older_than_days: 60, p_limit: 200 });
    expect(body.bug_feedback_still_open_prepared).toBe(7);
  });

  it('looks for queued fix-check reporters only, so 400+ queued still-open rows cannot crowd them out of the 200-row window', async () => {
    const { GET } = await import('@/app/api/cron/notification-processor/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/cron/notification-processor', {
      headers: { authorization: 'Bearer test-secret' },
    });

    await GET(req);

    // fn_bug_feedback_release_queued releases fix_check prompts only, so the
    // reporter list that feeds it must be fix_check rows only.
    const queuedFetch = queries.find(
      (q) =>
        q.table === 'bug_fix_feedback_requests' &&
        q.calls.some(([m, a]) => m === 'eq' && a[0] === 'status' && a[1] === 'pending_send') &&
        q.calls.some(([m]) => m === 'limit')
    );
    expect(queuedFetch, 'the queued-reporters fetch was not found').toBeDefined();
    expect(queuedFetch!.calls).toContainEqual(['eq', ['kind', 'fix_check']]);
  });
});
