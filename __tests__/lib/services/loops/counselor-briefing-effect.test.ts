/**
 * runCounselorBriefingMeasurement — the dispatcher's last_status summary.
 *
 * The daily cron (/api/cron/counselor-briefing-measure) reports three numbers
 * the Director reads on /admin/loops and /admin/ai-routines: rows measured,
 * rows with a delta (both sides cleared the de-noise floor), and counter-metric
 * hits (briefing_changed_nothing). A wrong count here is the difference between
 * "the loop is quiet" and "three counselors ignored every briefing" — so the
 * arithmetic is pinned against a mocked client, with NULL vs 0 deltas and
 * false vs true flags each represented. Fix round 2 for PR #3717.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  runCounselorBriefingMeasurement,
  COUNSELOR_BRIEFING_DEFAULTS,
  type CounselorBriefingEffectRow,
} from '@/lib/services/loops/counselor-briefing-effect';

type Admin = Parameters<typeof runCounselorBriefingMeasurement>[0];

function row(over: Partial<CounselorBriefingEffectRow>): CounselorBriefingEffectRow {
  return {
    institution_id: 'i1',
    counselor_id: 'c1',
    week_start: '2026-09-07',
    week_end: '2026-09-14',
    briefings_n: 5,
    named_leads_n: 3,
    named_leads_current_year_n: 3,
    named_leads_actioned_n: 1,
    named_action_rate: 33.33,
    named_forward_n: 0,
    named_forward_rate: null,
    baseline_acted_n: 4,
    baseline_forward_n: 2,
    baseline_forward_rate: 50,
    forward_delta: null,
    week_acted_all_n: 2,
    week_forward_all_n: 1,
    week_forward_all_rate: 50,
    ignored_briefings_n: 0,
    briefing_changed_nothing: false,
    ...over,
  };
}

function makeAdmin(reply: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => reply);
  return { admin: { rpc } as unknown as Admin, rpc };
}

describe('runCounselorBriefingMeasurement', () => {
  it('counts measured / with_delta / flagged_changed_nothing from the rows the fn returned', async () => {
    const rows = [
      row({ counselor_id: 'c1', forward_delta: null, briefing_changed_nothing: false }),
      // a delta of exactly 0 IS a delta (both sides cleared the floor)
      row({ counselor_id: 'c2', forward_delta: 0, briefing_changed_nothing: false }),
      row({ counselor_id: 'c3', forward_delta: 50, briefing_changed_nothing: true }),
      row({ counselor_id: 'c4', forward_delta: -25, briefing_changed_nothing: true }),
      // flagged with NO delta — the counter-metric reads week_forward_all_rate, not forward_delta
      row({ counselor_id: 'c5', forward_delta: null, briefing_changed_nothing: true }),
    ];
    const { admin, rpc } = makeAdmin({ data: rows, error: null });

    const res = await runCounselorBriefingMeasurement(admin, { asOf: '2026-09-13' });

    expect(res.measured).toBe(5);
    expect(res.with_delta).toBe(3);
    expect(res.flagged_changed_nothing).toBe(3);
    expect(res.rows).toBe(rows);
    expect(res.as_of).toBe('2026-09-13');
    expect(res.weeks_back).toBe(COUNSELOR_BRIEFING_DEFAULTS.weeksBack);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_counselor_briefing_measure', {
      p_as_of: '2026-09-13',
      p_weeks_back: COUNSELOR_BRIEFING_DEFAULTS.weeksBack,
    });
  });

  it('reports zeros (not a throw) when the fn returns no rows', async () => {
    const { admin } = makeAdmin({ data: [], error: null });
    const res = await runCounselorBriefingMeasurement(admin, { asOf: '2026-09-13', weeksBack: 1 });
    expect(res).toMatchObject({ measured: 0, with_delta: 0, flagged_changed_nothing: 0, weeks_back: 1 });
  });

  it('surfaces the fn error instead of reporting a silent zero', async () => {
    const { admin } = makeAdmin({ data: null, error: { message: 'relation does not exist' } });
    await expect(runCounselorBriefingMeasurement(admin, { asOf: '2026-09-13' })).rejects.toThrow(
      /fn_counselor_briefing_measure failed: relation does not exist/
    );
  });
});
