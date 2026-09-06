// __tests__/meetings/auto-close-retired.test.ts
//
// The 7-day auto-close is retired (Director, 2026-08-21: "Stop closing them
// automatically. the EAO for director will manage this and followup"),
// reversing the 2026-08-08 decision that created it.
//
// WHY THIS SUITE EXISTS. Retiring a sweep by deleting a line is the kind of
// change that silently comes back — a later refactor re-adds the RPC call, the
// routine keeps returning HTTP 200, and meetings quietly start being stamped
// 'completed' again with nobody noticing. Nothing else in the repo would catch
// that: the routine's own success signal is indistinguishable from the sweep
// working. These tests are that alarm.
//
// Production, 2026-08-21: outcome_marked_by is NULL on all 114 bookings, so no
// meeting has EVER been marked by a host; and none carries the sweep's own
// 'system' stamp either. The routine is live and healthy (last fired
// 2026-08-20 00:45Z, HTTP 200) and had simply found nothing older than its
// seven-day cutoff — with 17 bookings already past, it was days from stamping
// its first real batch.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc }),
}));

import { GET } from '@/app/api/cron/meetings-auto-close/route';

const SECRET = 'test-cron-secret';

function req(opts: { auth?: string; query?: string } = {}) {
  const url = `https://example.test/api/cron/meetings-auto-close${
    opts.query ? `?secret=${opts.query}` : ''
  }`;
  return {
    headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? opts.auth ?? null : null) },
    nextUrl: new URL(url),
  } as never;
}

beforeEach(() => {
  rpc.mockReset();
  process.env.CRON_SECRET = SECRET;
});

describe('the sweep no longer closes anything', () => {
  it('never calls fn_meetings_auto_close_unmarked', async () => {
    const res = await GET(req({ auth: `Bearer ${SECRET}` }));
    expect(rpc).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.closed).toBe(0);
    expect(body.retired).toBe(true);
  });

  it('reports ok, so a healthy routine does not read as broken every morning', async () => {
    const res = await GET(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('says WHY in the payload, so the dispatcher log explains itself', async () => {
    const body = await (await GET(req({ auth: `Bearer ${SECRET}` }))).json();
    expect(String(body.reason)).toMatch(/retired/i);
    expect(String(body.reason)).toMatch(/inbox/i);
  });
});

describe('retiring it did not open the endpoint up', () => {
  it('still refuses a caller with no secret', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still refuses a wrong secret', async () => {
    const res = await GET(req({ auth: 'Bearer nope' }));
    expect(res.status).toBe(401);
  });

  it('still accepts the ?secret= form the dispatcher may use', async () => {
    const res = await GET(req({ query: SECRET }));
    expect(res.status).toBe(200);
  });

  it('still fails loudly when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req({ auth: 'Bearer anything' }));
    expect(res.status).toBe(500);
  });
});
