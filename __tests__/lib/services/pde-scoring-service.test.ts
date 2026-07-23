import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock supabase client + the policy-reader module.
//
// Strategy: mock `createServerSupabaseClient` so .from(...).select().eq().single()
// returns the row we stage, and .rpc('fn_get_policy_json', ...) returns the
// rubric we stage. Mock `getDemonstrationWeights` so we control the 3-component
// weights without re-mocking its internals.
// ---------------------------------------------------------------------------

type FromHandler = {
  selectResult?: { data: any; error: any };
  updateResult?: { data: any; error: any };
};
const fromState: { [table: string]: FromHandler } = {};
const rpcMock = vi.fn();

function buildSupabaseMock() {
  return {
    from: (table: string) => {
      const state = fromState[table] ?? {};
      const chain: any = {
        _table: table,
        _payload: null,
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve(state.selectResult ?? { data: null, error: null })),
        update: vi.fn((payload: any) => {
          chain._payload = payload;
          // After update().eq().select().single() — we re-bind single() to return updateResult
          chain.single = vi.fn(() =>
            Promise.resolve(state.updateResult ?? { data: null, error: null })
          );
          return chain;
        }),
      };
      return chain;
    },
    rpc: rpcMock,
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve(buildSupabaseMock()),
}));

const getDemonstrationWeightsMock = vi.fn();
vi.mock('@/lib/services/pde-policy-reader', () => ({
  getDemonstrationWeights: (instId?: string | null) => getDemonstrationWeightsMock(instId),
}));

// Re-import after mocks (vitest hoists `vi.mock`).
import { PDEScoringService } from '@/lib/services/pde-scoring-service';

beforeEach(() => {
  rpcMock.mockReset();
  getDemonstrationWeightsMock.mockReset();
  for (const k of Object.keys(fromState)) delete fromState[k];
});

function stageDemonstration(row: any) {
  fromState['pde_demonstrations'] = {
    selectResult: { data: row, error: null },
    updateResult: { data: { ...row, status: 'scored' }, error: null },
  };
}

function stageRubric(rubric: any) {
  rpcMock.mockResolvedValueOnce({ data: rubric, error: null });
}

// ---------------------------------------------------------------------------
// computeWeightedScore — happy paths
// ---------------------------------------------------------------------------

describe('PDEScoringService.computeWeightedScore — happy paths', () => {
  it('weights sum to 100 → weighted equals raw_score, passes above threshold', async () => {
    stageDemonstration({
      id: 'd1',
      raw_score: 80,
      institution_id: null,
      rubric_policy_key: 'pde.rubrics.embodied.medical',
    });
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 50, peer: 30, ai: 20 });
    stageRubric({ scoring_band: { pass_threshold: 70 } });

    const result = await PDEScoringService.computeWeightedScore('d1');

    expect(result.raw).toBe(80);
    expect(result.weighted).toBe(80); // 80 * 100 / 100
    expect(result.passed).toBe(true); // 80 >= 70
  });

  it('passes exactly at threshold', async () => {
    stageDemonstration({
      id: 'd2',
      raw_score: 70,
      institution_id: null,
      rubric_policy_key: 'pde.rubrics.cultural_civic.local_community_project',
    });
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 50, peer: 30, ai: 20 });
    stageRubric({ scoring_band: { pass_threshold: 70 } });

    const result = await PDEScoringService.computeWeightedScore('d2');
    expect(result.passed).toBe(true);
  });

  it('fails below threshold', async () => {
    stageDemonstration({
      id: 'd3',
      raw_score: 50,
      institution_id: null,
      rubric_policy_key: 'pde.rubrics.embodied.medical',
    });
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 50, peer: 30, ai: 20 });
    stageRubric({ scoring_band: { pass_threshold: 70 } });

    const result = await PDEScoringService.computeWeightedScore('d3');
    expect(result.passed).toBe(false);
  });

  it('uses DEFAULT_PASS_THRESHOLD (60) when rubric_policy_key is null', async () => {
    stageDemonstration({
      id: 'd4',
      raw_score: 65,
      institution_id: null,
      rubric_policy_key: null, // no rubric → default 60
    });
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 50, peer: 30, ai: 20 });

    const result = await PDEScoringService.computeWeightedScore('d4');

    expect(result.passed).toBe(true); // 65 >= 60
    // RPC for fn_get_policy_json should NOT have been called
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('uses default pass threshold when rubric.scoring_band.pass_threshold is missing', async () => {
    stageDemonstration({
      id: 'd5',
      raw_score: 55,
      institution_id: null,
      rubric_policy_key: 'pde.rubrics.embodied.medical',
    });
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 50, peer: 30, ai: 20 });
    stageRubric({ evidence_required: 'video' }); // no scoring_band

    const result = await PDEScoringService.computeWeightedScore('d5');
    expect(result.passed).toBe(false); // 55 < 60 default
  });
});

// ---------------------------------------------------------------------------
// computeWeightedScore — weight edge cases (sum != 100)
// ---------------------------------------------------------------------------

describe('PDEScoringService.computeWeightedScore — weight sums', () => {
  it('weights sum > 100 → applied as-is (no normalization)', async () => {
    stageDemonstration({
      id: 'd6',
      raw_score: 50,
      institution_id: null,
      rubric_policy_key: 'pde.rubrics.embodied.medical',
    });
    // Sum = 150 → weighted = 50 * 150 / 100 = 75
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 60, peer: 60, ai: 30 });
    stageRubric({ scoring_band: { pass_threshold: 70 } });

    const result = await PDEScoringService.computeWeightedScore('d6');
    expect(result.weighted).toBe(75);
    expect(result.passed).toBe(true); // 75 >= 70
  });

  it('weights sum < 100 → applied as-is (no normalization)', async () => {
    stageDemonstration({
      id: 'd7',
      raw_score: 90,
      institution_id: null,
      rubric_policy_key: 'pde.rubrics.embodied.medical',
    });
    // Sum = 50 → weighted = 90 * 50 / 100 = 45
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 20, peer: 20, ai: 10 });
    stageRubric({ scoring_band: { pass_threshold: 50 } });

    const result = await PDEScoringService.computeWeightedScore('d7');
    expect(result.weighted).toBe(45);
    expect(result.passed).toBe(false); // 45 < 50
  });
});

// ---------------------------------------------------------------------------
// computeWeightedScore — error paths
// ---------------------------------------------------------------------------

describe('PDEScoringService.computeWeightedScore — errors', () => {
  it('throws when raw_score is null', async () => {
    stageDemonstration({
      id: 'd8',
      raw_score: null,
      institution_id: null,
      rubric_policy_key: 'pde.rubrics.embodied.medical',
    });
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 50, peer: 30, ai: 20 });

    await expect(PDEScoringService.computeWeightedScore('d8')).rejects.toThrow(/no raw_score/);
  });

  it('throws when demonstration not found', async () => {
    fromState['pde_demonstrations'] = {
      selectResult: { data: null, error: { message: 'PGRST116: no rows' } },
    };
    await expect(PDEScoringService.computeWeightedScore('missing')).rejects.toThrow(
      /failed to fetch demonstration/
    );
  });

  it('throws when rubric_policy_key is set but rubric row is empty', async () => {
    stageDemonstration({
      id: 'd9',
      raw_score: 80,
      institution_id: null,
      rubric_policy_key: 'pde.rubrics.does_not_exist',
    });
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 50, peer: 30, ai: 20 });
    rpcMock.mockResolvedValueOnce({ data: {}, error: null }); // empty rubric

    await expect(PDEScoringService.computeWeightedScore('d9')).rejects.toThrow(/not found or empty/);
  });
});

// ---------------------------------------------------------------------------
// scoreAndPersist
// ---------------------------------------------------------------------------

describe('PDEScoringService.scoreAndPersist', () => {
  it('persists computed values and flips status to scored', async () => {
    stageDemonstration({
      id: 'd10',
      raw_score: 85,
      institution_id: null,
      rubric_policy_key: 'pde.rubrics.embodied.medical',
      status: 'validated',
    });
    getDemonstrationWeightsMock.mockResolvedValueOnce({ faculty: 50, peer: 30, ai: 20 });
    stageRubric({ scoring_band: { pass_threshold: 70 } });

    const result = await PDEScoringService.scoreAndPersist('d10');
    expect(result.status).toBe('scored');
  });
});
