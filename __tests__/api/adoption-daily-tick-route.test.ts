/**
 * Adoption loop — the daily run's clock (rulings 9 + 10, Director 2026-09-24).
 *
 *   GET /api/cron/adoption-daily-tick
 *
 * The route sends in-app questions and reminders to real people, so the
 * load-bearing assertions are about who can make it run and what it reports:
 *
 *   - with no CRON_SECRET configured it refuses everything (500), never an
 *     open endpoint that messages people;
 *   - a missing or wrong Bearer header is 401 and the database is never called;
 *     the secret in the URL (?secret=) is NOT accepted — the dispatcher sends
 *     the header, and a secret in a URL ends up in logs;
 *   - ?dry_run=1 is passed through as p_dry_run: true;
 *   - an RPC error, or a run the database refused (success:false), is a 500 so
 *     the dispatcher records a failure instead of a healthy-looking 200;
 *   - "switched off" is a 200 skip, not a failure.
 * Every rule about who is asked or reminded lives in fn_adoption_daily_tick and
 * is proved by supabase/tests/adoption/run.sh, not here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type RpcArgs = Record<string, unknown> | undefined;
let rpcData: unknown = null;
let rpcError: { message: string } | null = null;
const rpc = vi.fn((_name: string, _args?: RpcArgs) => Promise.resolve({ data: rpcData, error: rpcError }));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc }),
}));

import { GET } from '@/app/api/cron/adoption-daily-tick/route';
import { summariseTick } from '@/lib/adoption/tick-summary';
import { summarizeRoutineResult } from '@/lib/ai-routines/summarize-routine-result';

const SECRET = 'test-cron-secret';

function request(opts: { bearer?: string; query?: string } = {}) {
  return {
    headers: new Headers(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
    nextUrl: new URL(`http://localhost:3000/api/cron/adoption-daily-tick${opts.query ?? ''}`),
  } as never;
}

beforeEach(() => {
  rpc.mockClear();
  rpcData = { success: true, dry_run: false, cap: 500, capped: false, asked: 3, reminded: 7, features: {} };
  rpcError = null;
  process.env.CRON_SECRET = SECRET;
});

describe('who can start the daily run', () => {
  it('refuses everything when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(request({ bearer: 'anything' }));
    expect(res.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a caller with no Bearer header, and messages nobody', async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret', async () => {
    const res = await GET(request({ bearer: 'nope' }));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not accept the secret in the URL', async () => {
    const res = await GET(request({ query: `?secret=${SECRET}` }));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('what the run does and reports', () => {
  it('calls the one database function for a real run', async () => {
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('fn_adoption_daily_tick');
    expect(rpc.mock.calls[0][1]).toEqual({ p_dry_run: false });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toBe('asked 3, reminded 7');
  });

  it('passes ?dry_run=1 through so a preview writes nothing', async () => {
    rpcData = { success: true, dry_run: true, cap: 500, capped: true, asked: 500, reminded: 0, features: {} };
    const res = await GET(request({ bearer: SECRET, query: '?dry_run=1' }));
    expect(res.status).toBe(200);
    expect(rpc.mock.calls[0][1]).toEqual({ p_dry_run: true });
    const body = await res.json();
    expect(body.summary).toBe('would ask 500, would remind 0 (cap 500 reached — the rest go on a later day)');
  });

  it('is a 500 when the database call fails', async () => {
    rpcData = null;
    rpcError = { message: 'function fn_adoption_daily_tick does not exist' };
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });

  it('is a 500 when the database refused the run', async () => {
    rpcData = { success: false, error: "no sender: the feature-adoption loop's owner_email matches no profile" };
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('no sender');
  });

  it('puts the totals at the top level so the dispatcher status line shows them', async () => {
    const res = await GET(request({ bearer: SECRET }));
    const body = await res.json();
    expect(body.sent).toBe(10);
    expect(body.asked).toBe(3);
    expect(body.reminded).toBe(7);
    const line = summarizeRoutineResult(200, body);
    expect(line).toContain('sent 10');
    expect(line).toContain('reminded 7');
  });

  it('is a 500 when the database answered nothing at all', async () => {
    rpcData = null;
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(500);
  });

  it('is a 200 skip when the loop is switched off', async () => {
    rpcData = { success: true, skipped: 'adoption loop is switched off (policy adoption.loop.enabled)', asked: 0, reminded: 0 };
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(200);
    expect((await res.json()).summary).toMatch(/^skipped: adoption loop is switched off/);
  });
});

describe('summariseTick', () => {
  it('reads missing counts as zero', () => {
    expect(summariseTick({ success: true })).toBe('asked 0, reminded 0');
  });
});
