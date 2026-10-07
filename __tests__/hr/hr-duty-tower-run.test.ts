/**
 * The weekly HR duty tower run (lib/services/hr/duty-tower/tower-run.ts) and
 * its cron route (app/api/cron/hr-duty-tower/route.ts). Migration 20271007161151.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordLoopMeasurement = vi.fn();
vi.mock('@/lib/services/loops/loop-bar-measurement', () => ({
  recordLoopMeasurement: (...args: unknown[]) => recordLoopMeasurement(...args),
}));

let serviceClient: unknown;
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => serviceClient,
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

import {
  lastWeekStartIST,
  rateToPercent,
  runHrDutyTower,
  towerRunId,
} from '@/lib/services/hr/duty-tower/tower-run';

type RpcAnswer = { data: unknown; error: { message: string } | null };

/** A fake service client: rpc answers by name; loop_measurements holds `existingRunIds`. */
function fakeAdmin(opts: {
  compute?: RpcAnswer;
  generate?: RpcAnswer;
  existingRunIds?: string[];
}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'fn_hr_duty_tower_compute') {
      return opts.compute ?? {
        data: [
          { duty_code: 'L1', items: 7, on_time_rate: '0.7143' },
          { duty_code: 'S2', items: 0, on_time_rate: null },
        ],
        error: null,
      };
    }
    if (name === 'fn_hr_trust_suggestions_generate') return opts.generate ?? { data: 0, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });
  const from = vi.fn((table: string) => {
    if (table !== 'loop_measurements') throw new Error(`unexpected table ${table}`);
    let runId = '';
    const chain = {
      select: () => chain,
      eq: (_col: string, v: string) => { runId = v; return chain; },
      limit: async () => ({
        data: (opts.existingRunIds ?? []).includes(runId) ? [{ id: 'm1' }] : [],
        error: null,
      }),
    };
    return chain;
  });
  return { rpc, from };
}

beforeEach(() => {
  recordLoopMeasurement.mockReset();
  recordLoopMeasurement.mockResolvedValue({ recorded: true, barValue: null, met: null, gap: 'no numeric bar yet' });
});

describe('lastWeekStartIST', () => {
  it('is the Monday before the IST week that holds now', () => {
    // Monday 2026-10-05 06:47 IST = 01:17 UTC
    expect(lastWeekStartIST(new Date('2026-10-05T01:17:00Z'))).toBe('2026-09-28');
    // Sunday 2026-10-04 23:00 IST is still the week of 2026-09-28
    expect(lastWeekStartIST(new Date('2026-10-04T17:30:00Z'))).toBe('2026-09-21');
  });
});

describe('runHrDutyTower', () => {
  it('records each duty on its tower row as a percentage, with a run id per week and duty', async () => {
    const admin = fakeAdmin({});
    const now = new Date('2026-10-05T01:17:00Z');
    const res = await runHrDutyTower(admin as never, now);

    expect(admin.rpc).toHaveBeenCalledWith('fn_hr_duty_tower_compute', { p_week_start: '2026-09-28' });
    expect(recordLoopMeasurement).toHaveBeenCalledTimes(2);
    expect(recordLoopMeasurement).toHaveBeenCalledWith(admin, {
      loopKey: 'hr-duty-l1',
      value: 71.43,
      runId: 'hr-duty-tower:2026-09-28:L1',
    });
    // a week with no items records no number
    expect(recordLoopMeasurement).toHaveBeenCalledWith(admin, {
      loopKey: 'hr-duty-s2',
      value: null,
      runId: 'hr-duty-tower:2026-09-28:S2',
    });
    expect(res.duties.map((d) => d.outcome)).toEqual(['recorded', 'recorded']);
    expect(admin.rpc).toHaveBeenCalledWith('fn_hr_trust_suggestions_generate');
  });

  it('is idempotent: a duty whose run id is already in loop_measurements is skipped', async () => {
    const admin = fakeAdmin({ existingRunIds: [towerRunId('2026-09-28', 'L1')] });
    const res = await runHrDutyTower(admin as never, new Date('2026-10-05T01:17:00Z'));
    expect(recordLoopMeasurement).toHaveBeenCalledTimes(1);
    expect(recordLoopMeasurement.mock.calls[0][1]).toMatchObject({ loopKey: 'hr-duty-s2' });
    expect(res.duties.find((d) => d.dutyCode === 'L1')?.outcome).toBe('skipped');
  });

  it('throws when the compute fails', async () => {
    const admin = fakeAdmin({ compute: { data: null, error: { message: 'boom' } } });
    await expect(runHrDutyTower(admin as never)).rejects.toThrow(/boom/);
    expect(recordLoopMeasurement).not.toHaveBeenCalled();
  });

  it('rateToPercent turns 0..1 into a percentage', () => {
    expect(rateToPercent('0.9')).toBe(90);
    expect(rateToPercent(1)).toBe(100);
    expect(rateToPercent(null)).toBeNull();
    expect(rateToPercent('x')).toBeNull();
  });
});

describe('GET /api/cron/hr-duty-tower', () => {
  const OLD = process.env.CRON_SECRET;
  beforeEach(() => { process.env.CRON_SECRET = 'test-secret'; });

  async function call(auth?: string, query = '') {
    const { GET } = await import('@/app/api/cron/hr-duty-tower/route');
    const { NextRequest } = await import('next/server');
    const headers: Record<string, string> = auth ? { authorization: auth } : {};
    return GET(new NextRequest(`http://localhost/api/cron/hr-duty-tower${query}`, { headers }));
  }

  it('refuses the secret in the address: Bearer header only', async () => {
    serviceClient = fakeAdmin({});
    expect((await call(undefined, '?secret=test-secret')).status).toBe(401);
    expect((await call(undefined, '?key=test-secret')).status).toBe(401);
    expect((await call(undefined, '?token=test-secret')).status).toBe(401);
  });

  it('the routine catalogue says the same: Bearer only, never the secret in the address', async () => {
    const { PLATFORM_OPS_ROUTINES } = await import('@/lib/ai-routines/platform-ops');
    const entry = (PLATFORM_OPS_ROUTINES as Array<Record<string, unknown>>).find((r) => r.id === 'hr-duty-tower');
    expect(entry).toBeDefined();
    const text = JSON.stringify(entry);
    expect(text).toMatch(/Bearer header ONLY/);
    expect(text).toMatch(/\?secret=\) is refused/);
    expect(text).not.toMatch(/\?secret=<|secret in the (address|URL) (works|is accepted)/i);
  });

  it('refuses a request without the Bearer secret', async () => {
    serviceClient = fakeAdmin({});
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong-secret')).status).toBe(401);
  });

  it('answers 500 when an RPC errors', async () => {
    serviceClient = fakeAdmin({ compute: { data: null, error: { message: 'compute failed' } } });
    const res = await call('Bearer test-secret');
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('answers 500 when the suggestions RPC errors', async () => {
    serviceClient = fakeAdmin({ generate: { data: null, error: { message: 'generate failed' } } });
    expect((await call('Bearer test-secret')).status).toBe(500);
  });

  it('answers 200 with the week and per-duty outcomes', async () => {
    serviceClient = fakeAdmin({});
    const res = await call('Bearer test-secret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.duties).toHaveLength(2);
    process.env.CRON_SECRET = OLD;
  });
});
