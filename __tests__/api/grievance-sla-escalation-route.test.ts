/**
 * Grievance SLA — the hourly breach stamp + escalation clock.
 *
 *   GET /api/cron/grievance-sla-breach-check
 *
 * The route reassigns complaints and messages real people, so the assertions
 * are about who can make it run and what it reports:
 *   - with no CRON_SECRET configured it refuses everything (500);
 *   - a missing or wrong Bearer header is 401 and the database is never called;
 *     the secret in the URL (?secret=) is NOT accepted;
 *   - ?dry_run=1 is passed through as p_dry_run: true;
 *   - an RPC error, or a run the database refused (success:false), is a 500;
 *   - the counters sit at the top level, and "nobody to escalate to" is shown.
 * Every rule about who a complaint goes to lives in fn_grievance_escalation_tick
 * and is proved by supabase/tests/grievance/run.sh, not here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type RpcArgs = Record<string, unknown> | undefined;
let rpcData: unknown = null;
let rpcError: { message: string; code?: string } | null = null;
const rpc = vi.fn((_name: string, _args?: RpcArgs) => Promise.resolve({ data: rpcData, error: rpcError }));

// The pre-migration path (deep review of #4079, M4): a plain select + update.
let overdueRows: { id: string }[] = [];
const updates: { values: Record<string, unknown>; ids: string[] }[] = [];
const from = vi.fn((_table: string) => ({
  select: () => {
    const chain = {
      in: () => chain,
      is: () => chain,
      lt: () => Promise.resolve({ data: overdueRows, error: null }),
    };
    return chain;
  },
  update: (values: Record<string, unknown>) => ({
    in: (_col: string, ids: string[]) => {
      updates.push({ values, ids });
      return Promise.resolve({ error: null });
    },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc, from }),
}));

import { GET } from '@/app/api/cron/grievance-sla-breach-check/route';
import { summarizeRoutineResult } from '@/lib/ai-routines/summarize-routine-result';

const SECRET = 'test-cron-secret';

function request(opts: { bearer?: string; query?: string } = {}) {
  return {
    headers: new Headers(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
    nextUrl: new URL(`http://localhost:3000/api/cron/grievance-sla-breach-check${opts.query ?? ''}`),
  } as never;
}

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
  overdueRows = [];
  updates.length = 0;
  rpcData = {
    success: true,
    dry_run: false,
    enabled: true,
    breached_stamped: 2,
    escalated: 6,
    notified: 6,
    skipped_no_target: 0,
    levels_skipped: 5,
    at_ceiling: 0,
    switched_off: 0,
    tickets: [],
  };
  rpcError = null;
  process.env.CRON_SECRET = SECRET;
});

describe('who can start the escalation run', () => {
  it('refuses everything when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(request({ bearer: 'anything' }));
    expect(res.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a caller with no Bearer header', async () => {
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
    expect(rpc.mock.calls[0][0]).toBe('fn_grievance_escalation_tick');
    expect(rpc.mock.calls[0][1]).toEqual({ p_dry_run: false });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toBe('escalated 6, marked breached 2, no one to escalate to 0, at the top level 0');
  });

  it('passes ?dry_run=1 through so a preview writes nothing', async () => {
    rpcData = { ...(rpcData as object), dry_run: true, notified: 0 };
    const res = await GET(request({ bearer: SECRET, query: '?dry_run=1' }));
    expect(res.status).toBe(200);
    expect(rpc.mock.calls[0][1]).toEqual({ p_dry_run: true });
    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.summary).toMatch(/^DRY RUN — would escalate 6/);
  });

  it('is a 500 when the database call fails', async () => {
    rpcData = null;
    rpcError = { message: 'function fn_grievance_escalation_tick does not exist' };
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });

  it('is a 500 when the database refused the run', async () => {
    rpcData = { success: false, error: 'something the database refused' };
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('refused');
  });

  it('is a 500 when the database answered nothing at all', async () => {
    rpcData = null;
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(500);
  });

  it('puts every counter at the top level so the status line shows them', async () => {
    rpcData = { ...(rpcData as object), skipped_no_target: 2, at_ceiling: 1, notify_failed: 1 };
    const res = await GET(request({ bearer: SECRET }));
    const body = await res.json();
    expect(body).toMatchObject({
      escalated: 6,
      notified: 6,
      notify_failed: 1,
      breached: 2,
      skipped_no_target: 2,
      levels_skipped: 5,
      at_ceiling: 1,
      switched_off: 0,
    });
    expect(body.summary).toContain('1 notice(s) FAILED to send');
    const line = summarizeRoutineResult(200, body);
    expect(line).toContain('escalated 6');
  });

  it('says so when escalation is switched off (still a 200)', async () => {
    rpcData = { ...(rpcData as object), enabled: false, escalated: 0, switched_off: 4 };
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toContain('(escalation switched off)');
    expect(body.switched_off).toBe(4);
  });
});

describe('an app deployed before its migration (M4)', () => {
  const missing = {
    code: 'PGRST202',
    message: 'Could not find the function public.fn_grievance_escalation_tick(p_dry_run) in the schema cache',
  };

  it('falls back to breach stamping only, as before the PR, instead of a 500 every hour', async () => {
    rpcError = missing;
    rpcData = null;
    overdueRows = [{ id: 't1' }, { id: 't2' }];
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, legacy: true, breached: 2 });
    expect(from).toHaveBeenCalledWith('grievance_tickets');
    expect(updates).toHaveLength(1);
    expect(updates[0].ids).toEqual(['t1', 't2']);
    expect(updates[0].values).toMatchObject({ sla_status: 'breached' });
  });

  it('a dry run on the fallback writes nothing', async () => {
    rpcError = { ...missing, code: '42883', message: 'function public.fn_grievance_escalation_tick(boolean) does not exist' };
    rpcData = null;
    overdueRows = [{ id: 't1' }];
    const res = await GET(request({ bearer: SECRET, query: '?dry_run=1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).breached).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it('another missing function is still a 500, not a silent fallback', async () => {
    rpcError = { code: 'PGRST202', message: 'Could not find the function public.fn_grievance_notify in the schema cache' };
    rpcData = null;
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(500);
    expect(from).not.toHaveBeenCalled();
  });
});
