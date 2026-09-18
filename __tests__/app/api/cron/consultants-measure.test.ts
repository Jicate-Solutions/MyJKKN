// ============================================================================
// The consultants loop's headline number — what it averages, and what it
// refuses to average.
//
// The measurer itself (fn_consultants_measure_conversion) is proved weekly
// against known deltas by fn_loops_regress_consultants. What is NOT proved
// anywhere else is the thin layer this route adds on top: which returned rows
// become the run's headline.
//
// Three ways that layer can lie quietly, all asserted here:
//
//   • Averaging a consultant BELOW the de-noise floor. The fn already NULLs
//     such a rate, but the route also holds the floor from the config row, and
//     a row carrying both a rate and a sub-floor attribution count (a stale
//     row, a hand-written one, a floor raised since) must not be counted.
//   • Returning 0 when nobody cleared the floor. A headline of 0 reads on a
//     screen as "these consultants convert nobody"; the honest answer is null,
//     and it is what gets recorded against the bar.
//   • Passing a silent 200 when the measure failed. The dispatcher records
//     last_status from the HTTP code, so a failed RPC that answered 200 would
//     enter the log as a healthy weekly run forever.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

type PolicyRow = { value: unknown } | null;

let rpcResult: { data: unknown; error: { message: string } | null } = { data: [], error: null };
let policyRow: PolicyRow = { value: 5 };
let barCalls: { loopKey: string; value: number | null; runId?: string | null }[] = [];
let barResult = {
  recorded: true,
  barValue: null as number | null,
  met: null as boolean | null,
  gap: 'no numeric bar yet' as string | null,
  error: undefined as string | undefined,
};
let rpcCalls: string[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (_table: string) => {
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: policyRow, error: null }),
      });
      return b as never;
    },
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return rpcResult;
    },
  }),
}));

vi.mock('@/lib/services/loops/loop-bar-measurement', () => ({
  recordLoopMeasurement: async (
    _admin: unknown,
    input: { loopKey: string; value: number | null; runId?: string | null }
  ) => {
    barCalls.push(input);
    return barResult;
  },
}));

import { GET, meanWindowConversionRate } from '@/app/api/cron/consultants-measure/route';

const SECRET = 'test-cron-secret';

function request(bearer?: string) {
  return {
    headers: new Headers(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    nextUrl: new URL('http://localhost:3000/api/cron/consultants-measure'),
  } as never;
}

/** A row shaped like one of fn_consultants_measure_conversion's returned rows. */
function row(attributions: number, rate: number | null) {
  return {
    consultant_id: `c-${attributions}-${rate}`,
    window_start: '2026-08-19',
    window_end: '2026-09-18',
    window_attributions: attributions,
    window_conversions: 0,
    window_conversion_rate: rate,
    baseline_attributions: 40,
    baseline_conversions: 4,
    baseline_conversion_rate: 10,
    conversion_delta: null,
  };
}

beforeEach(() => {
  rpcResult = { data: [], error: null };
  policyRow = { value: 5 };
  barCalls = [];
  rpcCalls = [];
  barResult = { recorded: true, barValue: null, met: null, gap: 'no numeric bar yet', error: undefined };
  process.env.CRON_SECRET = SECRET;
});

describe('authorisation', () => {
  it('refuses a caller with no Bearer header, and measures nothing', async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it('refuses a wrong secret', async () => {
    const res = await GET(request('nope'));
    expect(res.status).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it('refuses everything when CRON_SECRET is not configured', async () => {
    // Otherwise an unconfigured environment is an OPEN endpoint that writes
    // measurement rows.
    delete process.env.CRON_SECRET;
    const res = await GET(request('anything'));
    expect(res.status).toBe(500);
    expect(rpcCalls).toEqual([]);
  });
});

describe('the headline number', () => {
  it('averages only the consultants that cleared the de-noise floor', () => {
    const { headline, aboveFloor } = meanWindowConversionRate(
      [row(10, 20), row(30, 40), row(2, 99)] as never,
      5
    );
    // 99 belongs to a consultant with 2 attributions — noise the floor exists
    // to keep out. (20 + 40) / 2 = 30.
    expect(headline).toBe(30);
    expect(aboveFloor).toBe(2);
  });

  it('ignores a row whose rate the fn already NULLed', () => {
    const { headline, aboveFloor } = meanWindowConversionRate([row(3, null), row(10, 50)] as never, 5);
    expect(headline).toBe(50);
    expect(aboveFloor).toBe(1);
  });

  it('falls back to the fn\'s own NULLing when the config row could not be read', () => {
    // floor === null does NOT mean "no floor": fn_consultants_measure_conversion
    // has already NULLed every rate below its own floor, so a non-null rate is
    // itself the evidence the row cleared it. No constant is invented here.
    const { headline, aboveFloor } = meanWindowConversionRate([row(2, null), row(10, 12)] as never, null);
    expect(headline).toBe(12);
    expect(aboveFloor).toBe(1);
  });

  it('rounds to two decimal places, the same precision the rates carry', () => {
    const { headline } = meanWindowConversionRate([row(10, 10), row(10, 15), row(10, 21)] as never, 5);
    expect(headline).toBe(15.33);
  });

  it('reads a numeric rate that arrived as a string', () => {
    // PostgREST can hand numeric back as a string depending on the client; a
    // silently-dropped string would shrink the sample without saying so.
    const { headline, aboveFloor } = meanWindowConversionRate(
      [{ ...row(10, null), window_conversion_rate: '25.50' }] as never,
      5
    );
    expect(headline).toBe(25.5);
    expect(aboveFloor).toBe(1);
  });
});

describe('no consultants above the floor', () => {
  it('reports headline null, not 0, when every consultant is below the floor', async () => {
    rpcResult = { data: [row(1, null), row(4, null)], error: null };

    const res = await GET(request(SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.measured).toBe(2);
    expect(body.above_floor).toBe(0);
    // A 0 here would read on a screen as "these consultants convert nobody".
    expect(body.headline).toBeNull();
  });

  it('still records the run against the bar, carrying the null', async () => {
    rpcResult = { data: [row(1, null)], error: null };

    await GET(request(SECRET));

    expect(barCalls).toHaveLength(1);
    expect(barCalls[0].loopKey).toBe('consultants');
    expect(barCalls[0].value).toBeNull();
  });

  it('reports headline null when the measure returned no rows at all', async () => {
    // A legitimate reading: no consultant has an attribution in the ledger.
    rpcResult = { data: [], error: null };

    const res = await GET(request(SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.measured).toBe(0);
    expect(body.headline).toBeNull();
  });
});

describe('a failed measure is never a silent 200', () => {
  it('answers 500 when the RPC errors, and records nothing against the bar', async () => {
    rpcResult = { data: null, error: { message: 'relation does not exist' } };

    const res = await GET(request(SECRET));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(barCalls).toEqual([]);
  });

  it('answers 500 when the RPC returns no rows payload', async () => {
    rpcResult = { data: null, error: null };

    const res = await GET(request(SECRET));
    expect(res.status).toBe(500);
    expect(barCalls).toEqual([]);
  });

  it('reports a bar-recording failure alongside a successful run, never over it', async () => {
    rpcResult = { data: [row(10, 30)], error: null };
    barResult = { recorded: false, barValue: null, met: null, gap: null, error: 'bar column missing' };

    const res = await GET(request(SECRET));
    const body = await res.json();

    // The loop's own measurement succeeded; the bar bookkeeping did not.
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.headline).toBe(30);
    expect(body.bar_recorded).toBe(false);
    expect(body.bar_error).toBe('bar column missing');
  });
});

describe('the de-noise floor comes from the config row', () => {
  it('reports the floor it actually applied', async () => {
    policyRow = { value: 12 };
    rpcResult = { data: [row(10, 80), row(20, 40)], error: null };

    const res = await GET(request(SECRET));
    const body = await res.json();

    expect(body.min_attributions_k).toBe(12);
    // The 10-attribution consultant sits below a floor of 12.
    expect(body.above_floor).toBe(1);
    expect(body.headline).toBe(40);
  });

  it('reports a null floor when the config row is absent', async () => {
    policyRow = null;
    rpcResult = { data: [row(10, 40)], error: null };

    const res = await GET(request(SECRET));
    const body = await res.json();

    expect(body.min_attributions_k).toBeNull();
    expect(body.headline).toBe(40);
  });
});
