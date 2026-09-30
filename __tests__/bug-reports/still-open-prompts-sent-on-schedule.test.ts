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

// A chain that accepts any query-builder call and resolves to empty rows.
function chain(): unknown {
  const target = () => undefined;
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      }
      return () => chain();
    },
    apply() {
      return chain();
    },
  });
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => chain(),
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
});
