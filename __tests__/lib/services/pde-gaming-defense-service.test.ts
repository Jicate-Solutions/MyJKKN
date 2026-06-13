import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the policy reader so each test controls the policy values directly.
// ---------------------------------------------------------------------------

const getAgencyGamingDefenseMock = vi.fn();
const getDemonstrationWeightsMock = vi.fn();

vi.mock('@/lib/services/pde-policy-reader', () => ({
  getAgencyGamingDefense: (instId?: string | null) =>
    getAgencyGamingDefenseMock(instId),
  getDemonstrationWeights: (instId?: string | null) =>
    getDemonstrationWeightsMock(instId),
}));

import {
  clampRate,
  sampleRows,
  evaluateConsistency,
  runGamingDefenseSweep,
  DEFAULT_SUSPECT_THRESHOLD,
  AUDIT_ACTION_FLAGGED,
  type DemonstrationRow,
} from '@/lib/services/pde-gaming-defense-service';

beforeEach(() => {
  getAgencyGamingDefenseMock.mockReset();
  getDemonstrationWeightsMock.mockReset();
  getAgencyGamingDefenseMock.mockResolvedValue({
    mode: 'judgment_of_judgment_audit',
    audit_sample_rate: 0.1,
  });
  getDemonstrationWeightsMock.mockResolvedValue({ faculty: 50, peer: 30, ai: 20 });
});

// ---------------------------------------------------------------------------
// clampRate
// ---------------------------------------------------------------------------

describe('clampRate', () => {
  it('returns 0 for null / undefined / NaN', () => {
    expect(clampRate(null)).toBe(0);
    expect(clampRate(undefined)).toBe(0);
    expect(clampRate(NaN)).toBe(0);
  });
  it('clamps negative to 0', () => {
    expect(clampRate(-0.5)).toBe(0);
  });
  it('clamps >1 to 1', () => {
    expect(clampRate(1.5)).toBe(1);
  });
  it('passes through in-range values', () => {
    expect(clampRate(0.1)).toBe(0.1);
    expect(clampRate(1)).toBe(1);
    expect(clampRate(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sampleRows
// ---------------------------------------------------------------------------

describe('sampleRows', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` }));

  it('returns empty array at 0% sample rate', () => {
    expect(sampleRows(rows, 0)).toEqual([]);
  });

  it('returns all rows at 100% sample rate', () => {
    expect(sampleRows(rows, 1).length).toBe(100);
  });

  it('returns deterministic subset given a fixed RNG', () => {
    // RNG returns values that alternate above/below 0.5.
    let i = 0;
    const rng = () => {
      const v = i % 2 === 0 ? 0.2 : 0.8;
      i += 1;
      return v;
    };
    const picked = sampleRows(rows, 0.5, rng);
    expect(picked.length).toBe(50);
    expect(picked[0].id).toBe('r0');
    expect(picked[1].id).toBe('r2');
  });

  it('handles empty input', () => {
    expect(sampleRows([], 0.5)).toEqual([]);
  });

  it('clamps negative rate to 0', () => {
    expect(sampleRows(rows, -1)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// evaluateConsistency — suspect-threshold boundary
// ---------------------------------------------------------------------------

describe('evaluateConsistency', () => {
  const weights = { faculty: 50, peer: 30, ai: 20 }; // sums to 100 → weightSum=1.0

  it('returns score=1 (not suspect) when raw_score is null', () => {
    const r = evaluateConsistency({ raw_score: null, weighted_score: 5 }, weights, 0.7);
    expect(r.score).toBe(1);
    expect(r.suspect).toBe(false);
  });

  it('returns score=1 when raw_score is 0', () => {
    const r = evaluateConsistency({ raw_score: 0, weighted_score: 0 }, weights, 0.7);
    expect(r.score).toBe(1);
    expect(r.suspect).toBe(false);
  });

  it('returns score=0 + suspect when weighted_score is null but raw is set', () => {
    const r = evaluateConsistency({ raw_score: 10, weighted_score: null }, weights, 0.7);
    expect(r.score).toBe(0);
    expect(r.suspect).toBe(true);
  });

  it('returns high consistency when weighted matches policy weights', () => {
    // raw=10, weighted=10 → implied=1.0, weightSum=1.0 → divergence=0
    const r = evaluateConsistency({ raw_score: 10, weighted_score: 10 }, weights, 0.7);
    expect(r.score).toBeCloseTo(1, 5);
    expect(r.divergence).toBeCloseTo(0, 5);
    expect(r.suspect).toBe(false);
  });

  it('flags suspect when divergence exceeds threshold (low threshold)', () => {
    // implied = 0/10 = 0, divergence = |0 - 1| = 1, threshold 0.7 → suspect
    const r = evaluateConsistency({ raw_score: 10, weighted_score: 0 }, weights, 0.7);
    expect(r.suspect).toBe(true);
    expect(r.divergence).toBe(1);
  });

  it('does NOT flag when divergence is below threshold (high threshold)', () => {
    // divergence ~ 0.5, threshold 0.9 → not suspect
    const r = evaluateConsistency({ raw_score: 10, weighted_score: 5 }, weights, 0.9);
    expect(r.suspect).toBe(false);
  });

  it('treats threshold boundary inclusively (>= triggers)', () => {
    // implied = 5/10 = 0.5, divergence = 0.5, threshold 0.5 → suspect (>=)
    const r = evaluateConsistency({ raw_score: 10, weighted_score: 5 }, weights, 0.5);
    expect(r.suspect).toBe(true);
  });

  it('handles pathological zero-weight policy', () => {
    const r = evaluateConsistency(
      { raw_score: 10, weighted_score: 10 },
      { faculty: 0, peer: 0, ai: 0 },
      0.7
    );
    expect(r.score).toBe(0);
    expect(r.suspect).toBe(true);
  });

  it('handles negative implied (corrupt data) defensively', () => {
    const r = evaluateConsistency({ raw_score: 10, weighted_score: -5 }, weights, 0.7);
    expect(r.score).toBe(0);
    expect(r.suspect).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runGamingDefenseSweep — integration with mocked supabase
// ---------------------------------------------------------------------------

/**
 * Build a minimal supabase double that captures the chain:
 *   .from(table).select(...).in(...).gte(...) → { data, error }
 *   .from(table).insert(payload) → { error }
 */
function buildSupabaseDouble(candidates: DemonstrationRow[]) {
  const inserts: any[] = [];
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ data: candidates, error: null }),
  };
  const insertImpl = vi.fn((payload: any) => {
    inserts.push(payload);
    return Promise.resolve({ error: null });
  });
  const from = vi.fn((table: string) => {
    if (table === 'sh_audit_logs') {
      return { insert: insertImpl };
    }
    return selectChain;
  });
  return { supabase: { from } as any, inserts };
}

function mkRow(overrides: Partial<DemonstrationRow> = {}): DemonstrationRow {
  return {
    id: 'demo-1',
    learner_id: 'learner-1',
    institution_id: 'inst-1',
    category_key: 'cat-a',
    rubric_policy_key: 'rubric-a',
    validator_ids: ['v1'],
    raw_score: 10,
    weighted_score: 10,
    passed: true,
    scored_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('runGamingDefenseSweep', () => {
  it('returns 0 sampled when policy sample_rate=0', async () => {
    getAgencyGamingDefenseMock.mockResolvedValue({
      mode: 'judgment_of_judgment_audit',
      audit_sample_rate: 0,
    });
    const { supabase, inserts } = buildSupabaseDouble([mkRow(), mkRow({ id: 'd2' })]);
    const metrics = await runGamingDefenseSweep(supabase);
    expect(metrics.sampled).toBe(0);
    expect(metrics.flagged).toBe(0);
    expect(metrics.total_candidates).toBe(2);
    expect(inserts).toHaveLength(0);
  });

  it('samples all rows when policy sample_rate=1', async () => {
    getAgencyGamingDefenseMock.mockResolvedValue({
      mode: 'judgment_of_judgment_audit',
      audit_sample_rate: 1,
    });
    const consistentRows = [mkRow({ id: 'a' }), mkRow({ id: 'b' }), mkRow({ id: 'c' })];
    const { supabase, inserts } = buildSupabaseDouble(consistentRows);
    const metrics = await runGamingDefenseSweep(supabase);
    expect(metrics.sampled).toBe(3);
    expect(metrics.evaluated).toBe(3);
    // All rows have weighted == raw → divergence=0 → no flags.
    expect(metrics.flagged).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it('flags suspect rows and writes to sh_audit_logs', async () => {
    getAgencyGamingDefenseMock.mockResolvedValue({
      mode: 'judgment_of_judgment_audit',
      audit_sample_rate: 1,
    });
    // raw=10, weighted=0 → divergence=1 → suspect at default threshold 0.7
    const suspectRow = mkRow({ id: 'suspect-1', raw_score: 10, weighted_score: 0 });
    const cleanRow = mkRow({ id: 'clean-1', raw_score: 10, weighted_score: 10 });
    const { supabase, inserts } = buildSupabaseDouble([suspectRow, cleanRow]);
    const metrics = await runGamingDefenseSweep(supabase);
    expect(metrics.sampled).toBe(2);
    expect(metrics.flagged).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].action).toBe(AUDIT_ACTION_FLAGGED);
    expect(inserts[0].entity_type).toBe('pde_demonstration');
    expect(inserts[0].entity_id).toBe('suspect-1');
    expect(inserts[0].details.divergence).toBe(1);
    expect(inserts[0].details.suspect_threshold).toBe(DEFAULT_SUSPECT_THRESHOLD);
  });

  it('honors suspectThresholdOverride for tests', async () => {
    getAgencyGamingDefenseMock.mockResolvedValue({
      mode: 'judgment_of_judgment_audit',
      audit_sample_rate: 1,
    });
    // implied=0.5, divergence=0.5 → not suspect at 0.7, suspect at 0.4
    const row = mkRow({ id: 'mid', raw_score: 10, weighted_score: 5 });
    {
      const { supabase, inserts } = buildSupabaseDouble([row]);
      const m = await runGamingDefenseSweep(supabase, { suspectThresholdOverride: 0.4 });
      expect(m.flagged).toBe(1);
      expect(inserts).toHaveLength(1);
    }
    {
      const { supabase, inserts } = buildSupabaseDouble([row]);
      const m = await runGamingDefenseSweep(supabase, { suspectThresholdOverride: 0.7 });
      expect(m.flagged).toBe(0);
      expect(inserts).toHaveLength(0);
    }
  });

  it('aggregates row-level errors without aborting the sweep', async () => {
    getAgencyGamingDefenseMock.mockResolvedValue({
      mode: 'judgment_of_judgment_audit',
      audit_sample_rate: 1,
    });
    const suspectRow = mkRow({ id: 's1', raw_score: 10, weighted_score: 0 });
    const cleanRow = mkRow({ id: 'c1', raw_score: 10, weighted_score: 10 });
    const candidates = [suspectRow, cleanRow];
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: candidates, error: null }),
    };
    const insertImpl = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'sh_audit_logs') return { insert: insertImpl };
        return selectChain;
      }),
    };
    // Silence the row-level error logging this test is exercising.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const metrics = await runGamingDefenseSweep(supabase);
    errSpy.mockRestore();
    expect(metrics.evaluated).toBe(2);
    expect(metrics.flagged).toBe(0); // increment happens AFTER persistFlag succeeds
    expect(metrics.errors).toBe(1);
  });

  it('exposes policy_mode + sample_rate + duration_ms in metrics', async () => {
    const { supabase } = buildSupabaseDouble([]);
    const metrics = await runGamingDefenseSweep(supabase);
    expect(metrics.policy_mode).toBe('judgment_of_judgment_audit');
    expect(metrics.sample_rate).toBe(0.1);
    expect(metrics.suspect_threshold).toBe(DEFAULT_SUSPECT_THRESHOLD);
    expect(typeof metrics.duration_ms).toBe('number');
    expect(metrics.duration_ms).toBeGreaterThanOrEqual(0);
  });
});
