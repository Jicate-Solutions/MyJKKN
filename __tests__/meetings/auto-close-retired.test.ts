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
//
// 2026-10-02 — PARTIAL REVERSAL, and the alarm stays. Requested by the Front
// desk session and confirmed by the Director in the myjkkn-agent chat, choosing
// "Close those with notes" over "Keep the 21 Aug rule": a past meeting that has
// meeting notes linked is now closed by the same routine, through
// fn_meetings_close_with_notes (migration 20271003091700). A meeting WITHOUT
// notes still waits for a person. So the alarm is sharper, not gone: the route
// must call fn_meetings_close_with_notes exactly once and NOTHING else — above
// all never fn_meetings_auto_close_unmarked, which closes every unmarked
// meeting whether or not anyone has a record of it.

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
  rpc.mockResolvedValue({ data: 0, error: null });
  process.env.CRON_SECRET = SECRET;
});

describe('the 7-day close of EVERY unmarked meeting stays retired', () => {
  it('never calls fn_meetings_auto_close_unmarked', async () => {
    await GET(req({ auth: `Bearer ${SECRET}` }));
    const names = rpc.mock.calls.map((c) => c[0]);
    expect(names).not.toContain('fn_meetings_auto_close_unmarked');
  });

  it('calls fn_meetings_close_with_notes exactly once, with the 7-day window, and nothing else', async () => {
    await GET(req({ auth: `Bearer ${SECRET}` }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_meetings_close_with_notes', { p_older_than_days: 7 });
  });
});

describe('what the routine reports', () => {
  it('reports how many it closed, under a name that says why', async () => {
    rpc.mockResolvedValue({ data: 61, error: null });
    const res = await GET(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.closed_with_notes).toBe(61);
    // The old 'closed' key is gone, so a log line cannot be read as the
    // retired sweep having come back.
    expect(body.closed).toBeUndefined();
  });

  it('a quiet morning reports ok with 0, so a healthy routine does not read as broken', async () => {
    const res = await GET(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.closed_with_notes).toBe(0);
  });

  it('says the rule in the payload, so the dispatcher log explains itself', async () => {
    const body = await (await GET(req({ auth: `Bearer ${SECRET}` }))).json();
    expect(String(body.rule)).toMatch(/notes/i);
    expect(String(body.rule)).toMatch(/inbox/i);
  });

  it('names the missing migration when the function is not there yet (503, not an opaque 500)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    const res = await GET(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain('20271003091700');
  });

  it('fails loudly on any other database error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    const res = await GET(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});

describe('the endpoint is still locked', () => {
  it('refuses a caller with no secret, and closes nothing', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret, and closes nothing', async () => {
    const res = await GET(req({ auth: 'Bearer nope' }));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still accepts the ?secret= form the dispatcher may use', async () => {
    const res = await GET(req({ query: SECRET }));
    expect(res.status).toBe(200);
  });

  it('still fails loudly when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req({ auth: 'Bearer anything' }));
    expect(res.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });
});
