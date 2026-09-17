/**
 * recordLoopMeasurement — turning a loop's headline number into a verdict
 * against its bar.
 *
 * Director rulings 2026-09-16 (G3): every loop is judged against ONE concrete
 * bar. His 2026-09-17 answer settles the case this file mostly guards: a bar
 * written in words ("forward-move rate vs own trailing 8 weeks") must NOT be
 * parsed into a number — the run records met = NULL with the honest gap "no
 * numeric bar yet", which is neither a hit nor a miss and never moves the miss
 * streak. Getting that wrong would invent verdicts out of prose and, four
 * invented misses later, put a "bar may be wrong" card on the Director's desk
 * about a loop nobody measured.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  recordLoopMeasurement,
  parsePlainNumericBar,
  NO_NUMERIC_BAR_GAP,
} from '@/lib/services/loops/loop-bar-measurement';

type Admin = Parameters<typeof recordLoopMeasurement>[0];

/** Minimal stand-in for the service-role client: one registry read + one rpc. */
function makeAdmin(opts: {
  bar?: string | null;
  readError?: string;
  rpcError?: string;
}) {
  const rpc = vi.fn(async (_fn: string, _args?: Record<string, unknown>) => ({
    data: null,
    error: opts.rpcError ? { message: opts.rpcError } : null,
  }));
  const maybeSingle = vi.fn(async () => ({
    data: opts.readError ? null : { bar: opts.bar ?? null },
    error: opts.readError ? { message: opts.readError } : null,
  }));
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
  }));
  return { admin: { from, rpc } as unknown as Admin, rpc, from };
}

describe('parsePlainNumericBar', () => {
  it('accepts a bar that IS a plain number', () => {
    expect(parsePlainNumericBar('85')).toBe(85);
    expect(parsePlainNumericBar('  -2.5 ')).toBe(-2.5);
    expect(parsePlainNumericBar('0')).toBe(0);
  });

  it('refuses prose, units and anything not wholly numeric', () => {
    expect(parsePlainNumericBar('forward-move rate vs own trailing 8 weeks')).toBeNull();
    expect(parsePlainNumericBar('own last 8 weeks')).toBeNull();
    expect(parsePlainNumericBar('85%')).toBeNull();
    expect(parsePlainNumericBar('at least 85')).toBeNull();
    expect(parsePlainNumericBar('')).toBeNull();
    expect(parsePlainNumericBar(null)).toBeNull();
    expect(parsePlainNumericBar(undefined)).toBeNull();
  });
});

describe('recordLoopMeasurement', () => {
  it('records met = NULL when the loop has NO bar yet', async () => {
    const { admin, rpc } = makeAdmin({ bar: null });
    const res = await recordLoopMeasurement(admin, { loopKey: 'scf', value: 42 });

    expect(res.recorded).toBe(true);
    expect(res.barValue).toBeNull();
    expect(res.met).toBeNull();
    expect(res.gap).toBe(NO_NUMERIC_BAR_GAP);
    expect(rpc).toHaveBeenCalledWith('fn_loop_record_measurement', {
      p_loop_key: 'scf',
      p_value: 42,
      p_bar_value: null,
      p_met: null,
      p_gap: NO_NUMERIC_BAR_GAP,
      p_run_id: null,
    });
  });

  it('records met = NULL when the bar is words, never a guessed number', async () => {
    const { admin, rpc } = makeAdmin({ bar: 'forward-move rate vs own trailing 8 weeks' });
    const res = await recordLoopMeasurement(admin, {
      loopKey: 'counselor-briefing-effect',
      value: 3.5,
      runId: 'r1',
    });

    expect(res.met).toBeNull();
    expect(res.barValue).toBeNull();
    expect(res.gap).toBe(NO_NUMERIC_BAR_GAP);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_met: null, p_bar_value: null, p_run_id: 'r1' });
  });

  it('judges the run only when BOTH sides are numbers', async () => {
    const cleared = makeAdmin({ bar: '10' });
    const hit = await recordLoopMeasurement(cleared.admin, { loopKey: 'x', value: 12 });
    expect(hit.met).toBe(true);
    expect(hit.barValue).toBe(10);
    expect(hit.gap).toBe('2.00 vs the bar');

    const missedAdmin = makeAdmin({ bar: '10' });
    const miss = await recordLoopMeasurement(missedAdmin.admin, { loopKey: 'x', value: 8 });
    expect(miss.met).toBe(false);
    expect(miss.gap).toBe('-2.00 vs the bar');

    // Exactly ON the bar clears it — the bar is a floor, not a hurdle to beat.
    const onBar = makeAdmin({ bar: '10' });
    expect((await recordLoopMeasurement(onBar.admin, { loopKey: 'x', value: 10 })).met).toBe(true);
  });

  it('records met = NULL when the RUN produced no number, even with a numeric bar', async () => {
    const { admin } = makeAdmin({ bar: '10' });
    const res = await recordLoopMeasurement(admin, { loopKey: 'x', value: null });
    expect(res.met).toBeNull();
    expect(res.gap).toBe(NO_NUMERIC_BAR_GAP);
  });

  it('reports a failed registry read instead of throwing into the loop', async () => {
    const { admin, rpc } = makeAdmin({ readError: 'column loop_registry.bar does not exist' });
    const res = await recordLoopMeasurement(admin, { loopKey: 'x', value: 1 });

    expect(res.recorded).toBe(false);
    expect(res.error).toContain('does not exist');
    // Nothing is recorded when the bar could not be read — no invented verdict.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports a failed rpc instead of throwing into the loop', async () => {
    const { admin } = makeAdmin({ bar: '10', rpcError: 'not authorized' });
    const res = await recordLoopMeasurement(admin, { loopKey: 'x', value: 12 });

    expect(res.recorded).toBe(false);
    expect(res.error).toBe('not authorized');
    // The verdict it WOULD have recorded is still reported back to the caller.
    expect(res.met).toBe(true);
  });
});

/**
 * The counselor-briefing loop's own wiring: every run records where it landed
 * against its bar, using the number the loop ALREADY computes (the mean
 * forward_delta across rows that have one). The recording must never be able
 * to fail the measurement it rides on.
 */
describe('runCounselorBriefingMeasurement — bar recording', () => {
  it('records the mean forward_delta against the loop bar, and survives a missing bar column', async () => {
    const { runCounselorBriefingMeasurement, COUNSELOR_BRIEFING_LOOP_KEY } = await import(
      '@/lib/services/loops/counselor-briefing-effect'
    );

    const measureRows = [
      { forward_delta: null, briefing_changed_nothing: false },
      { forward_delta: 2, briefing_changed_nothing: false },
      { forward_delta: 4, briefing_changed_nothing: true },
    ];
    const rpc = vi.fn(async (fn: string, _args?: Record<string, unknown>) =>
      fn === 'fn_counselor_briefing_measure'
        ? { data: measureRows, error: null }
        : { data: null, error: null },
    );
    const maybeSingle = vi.fn(async () => ({ data: { bar: null }, error: null }));
    const admin = {
      rpc,
      from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
    } as unknown as Parameters<typeof runCounselorBriefingMeasurement>[0];

    const res = await runCounselorBriefingMeasurement(admin, { asOf: '2026-09-17' });

    expect(res.measured).toBe(3);
    expect(res.headline).toBe(3); // (2 + 4) / 2 — the NULL row is not averaged in
    const recorded = rpc.mock.calls.find((c) => c[0] === 'fn_loop_record_measurement');
    expect(recorded).toBeTruthy();
    expect(recorded?.[1]).toMatchObject({
      p_loop_key: COUNSELOR_BRIEFING_LOOP_KEY,
      p_value: 3,
      p_met: null,
      p_gap: NO_NUMERIC_BAR_GAP,
    });
  });

  it('still returns the measurement when the bar recording fails outright', async () => {
    const { runCounselorBriefingMeasurement } = await import(
      '@/lib/services/loops/counselor-briefing-effect'
    );
    // No .from at all — the same shape the pre-bars tests use.
    const rpc = vi.fn(async (_fn: string, _args?: Record<string, unknown>) => ({
      data: [],
      error: null,
    }));
    const admin = { rpc } as unknown as Parameters<typeof runCounselorBriefingMeasurement>[0];

    const res = await runCounselorBriefingMeasurement(admin, { asOf: '2026-09-17' });
    expect(res.measured).toBe(0);
    expect(res.headline).toBeNull();
  });
});
