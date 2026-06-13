import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the SUT import. Vitest hoists vi.mock.
// ---------------------------------------------------------------------------

// Policy reader: drives the mode branch in the SUT.
const getAgencyIndexModeMock = vi.fn();
vi.mock('@/lib/services/pde-policy-reader', () => ({
  getAgencyIndexMode: (institutionId?: string | null) =>
    getAgencyIndexModeMock(institutionId),
}));

// Supabase client: chainable query builder mock. Each .from() returns a
// fresh builder so call-order between snapshot + demonstrations does not
// leak across tests.
type BuilderResolve = { data: unknown; error: unknown };

let snapshotResolve: BuilderResolve = { data: null, error: null };
let demonstrationsResolve: BuilderResolve = { data: null, error: null };

function makeBuilder(resolveValue: () => BuilderResolve) {
  const b: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve(resolveValue())),
    // For non-single queries we want the await on the builder itself to
    // resolve. Implement `then` so it acts like a thenable for the
    // demonstrations branch.
    then: (onFulfilled: (v: BuilderResolve) => unknown) =>
      Promise.resolve(resolveValue()).then(onFulfilled),
  };
  return b;
}

const fromMock = vi.fn((table: string) => {
  if (table === 'pde_agency_index') {
    return makeBuilder(() => snapshotResolve);
  }
  if (table === 'pde_demonstrations') {
    return makeBuilder(() => demonstrationsResolve);
  }
  return makeBuilder(() => ({ data: null, error: null }));
});

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve({ from: fromMock }),
}));

// SUT imported AFTER mocks.
import {
  PDEAgencyLiveService,
  bucketise,
} from '@/lib/services/pde-agency-live-service';

// ---------------------------------------------------------------------------
// Per-test reset.
// ---------------------------------------------------------------------------
beforeEach(() => {
  getAgencyIndexModeMock.mockReset();
  fromMock.mockClear();
  snapshotResolve = { data: null, error: null };
  demonstrationsResolve = { data: null, error: null };
});

// ---------------------------------------------------------------------------
// bucketise — pure helper.
// ---------------------------------------------------------------------------

describe('bucketise', () => {
  it('rounds down to the nearest bucket', () => {
    expect(bucketise(73, 10)).toBe(70);
    expect(bucketise(70, 10)).toBe(70);
    expect(bucketise(79, 10)).toBe(70);
    expect(bucketise(80, 10)).toBe(80);
    expect(bucketise(0, 10)).toBe(0);
  });

  it('returns the value untouched when bucket is non-positive', () => {
    expect(bucketise(73, 0)).toBe(73);
    expect(bucketise(73, -5)).toBe(73);
  });
});

// ---------------------------------------------------------------------------
// recomputeForLearner — mode branching.
// ---------------------------------------------------------------------------

describe('PDEAgencyLiveService.recomputeForLearner', () => {
  it('mode=semester_end returns snapshot as-is', async () => {
    getAgencyIndexModeMock.mockResolvedValue('semester_end');
    snapshotResolve = {
      data: { overall: 64, created_at: '2026-05-10T00:00:00Z' },
      error: null,
    };

    const result = await PDEAgencyLiveService.recomputeForLearner('learner-1');

    expect(result.agency_score).toBe(64);
    expect(result.source).toBe('snapshot');
    expect(result.fell_back_to_snapshot).toBe(false);
    // demonstrations table should NOT be queried in semester_end mode.
    expect(fromMock).toHaveBeenCalledWith('pde_agency_index');
    expect(fromMock).not.toHaveBeenCalledWith('pde_demonstrations');
  });

  it('mode=semester_end with no snapshot returns score=0', async () => {
    getAgencyIndexModeMock.mockResolvedValue('semester_end');
    snapshotResolve = { data: null, error: null };

    const result = await PDEAgencyLiveService.recomputeForLearner('learner-1');

    expect(result.agency_score).toBe(0);
    expect(result.source).toBe('snapshot');
  });

  it('mode=live recomputes from demonstrations and normalises', async () => {
    getAgencyIndexModeMock.mockResolvedValue('live');
    // Sum = 250; cap = 500 → 50.
    demonstrationsResolve = {
      data: [
        { weighted_score: 100, scored_at: '2026-05-10T00:00:00Z' },
        { weighted_score: 150, scored_at: '2026-05-11T00:00:00Z' },
      ],
      error: null,
    };

    const result = await PDEAgencyLiveService.recomputeForLearner('learner-1');

    expect(result.source).toBe('live');
    expect(result.fell_back_to_snapshot).toBe(false);
    expect(result.agency_score).toBe(50);
    expect(fromMock).toHaveBeenCalledWith('pde_demonstrations');
  });

  it('mode=live clamps score to 100 when sum exceeds cap', async () => {
    getAgencyIndexModeMock.mockResolvedValue('live');
    demonstrationsResolve = {
      data: [{ weighted_score: 9999, scored_at: '2026-05-10T00:00:00Z' }],
      error: null,
    };

    const result = await PDEAgencyLiveService.recomputeForLearner('learner-1');
    expect(result.agency_score).toBe(100);
  });

  it('mode=live falls back to snapshot when no demonstrations in window', async () => {
    getAgencyIndexModeMock.mockResolvedValue('live');
    demonstrationsResolve = { data: [], error: null };
    snapshotResolve = {
      data: { overall: 42, created_at: '2026-05-01T00:00:00Z' },
      error: null,
    };

    const result = await PDEAgencyLiveService.recomputeForLearner('learner-1');

    expect(result.agency_score).toBe(42);
    expect(result.source).toBe('live'); // mode unchanged
    expect(result.fell_back_to_snapshot).toBe(true);
  });

  it('mode=live_coarse buckets the recomputed value to the nearest 10', async () => {
    getAgencyIndexModeMock.mockResolvedValue('live_coarse');
    // Sum = 365; 365/500*100 = 73 → bucketed to 70.
    demonstrationsResolve = {
      data: [{ weighted_score: 365, scored_at: '2026-05-10T00:00:00Z' }],
      error: null,
    };

    const result = await PDEAgencyLiveService.recomputeForLearner('learner-1');

    expect(result.source).toBe('live_coarse');
    expect(result.agency_score).toBe(70);
  });

  it('mode=live_coarse falls back to snapshot when no demonstrations exist', async () => {
    getAgencyIndexModeMock.mockResolvedValue('live_coarse');
    demonstrationsResolve = { data: [], error: null };
    snapshotResolve = {
      data: { overall: 33, created_at: '2026-04-01T00:00:00Z' },
      error: null,
    };

    const result = await PDEAgencyLiveService.recomputeForLearner('learner-1');

    expect(result.agency_score).toBe(33);
    expect(result.source).toBe('live_coarse');
    expect(result.fell_back_to_snapshot).toBe(true);
  });

  it('passes institutionId through to the policy reader', async () => {
    getAgencyIndexModeMock.mockResolvedValue('semester_end');
    snapshotResolve = { data: { overall: 50, created_at: 'x' }, error: null };

    await PDEAgencyLiveService.recomputeForLearner('learner-1', 'inst-1');

    expect(getAgencyIndexModeMock).toHaveBeenCalledWith('inst-1');
  });
});

// ---------------------------------------------------------------------------
// getDisplayFor — convenience wrapper.
// ---------------------------------------------------------------------------

describe('PDEAgencyLiveService.getDisplayFor', () => {
  it('returns refresh_recommended=false in semester_end mode', async () => {
    getAgencyIndexModeMock.mockResolvedValue('semester_end');
    snapshotResolve = {
      data: { overall: 55, created_at: '2026-05-10T00:00:00Z' },
      error: null,
    };

    const result = await PDEAgencyLiveService.getDisplayFor('learner-1');

    expect(result.refresh_recommended).toBe(false);
    expect(result.mode).toBe('semester_end');
    expect(result.score).toBe(55);
  });

  it('returns refresh_recommended=true in live mode', async () => {
    getAgencyIndexModeMock.mockResolvedValue('live');
    demonstrationsResolve = {
      data: [{ weighted_score: 200, scored_at: '2026-05-10T00:00:00Z' }],
      error: null,
    };

    const result = await PDEAgencyLiveService.getDisplayFor('learner-1');

    expect(result.refresh_recommended).toBe(true);
    expect(result.mode).toBe('live');
    expect(result.source).toBe('live');
  });

  it('returns refresh_recommended=true in live_coarse mode', async () => {
    getAgencyIndexModeMock.mockResolvedValue('live_coarse');
    demonstrationsResolve = {
      data: [{ weighted_score: 200, scored_at: '2026-05-10T00:00:00Z' }],
      error: null,
    };

    const result = await PDEAgencyLiveService.getDisplayFor('learner-1');

    expect(result.refresh_recommended).toBe(true);
    expect(result.mode).toBe('live_coarse');
  });

  it('computes stale_seconds from computed_at', async () => {
    getAgencyIndexModeMock.mockResolvedValue('semester_end');
    const old = new Date(Date.now() - 60_000).toISOString(); // 60s ago
    snapshotResolve = { data: { overall: 40, created_at: old }, error: null };

    const result = await PDEAgencyLiveService.getDisplayFor('learner-1');

    expect(result.stale_seconds).toBeGreaterThanOrEqual(60);
    expect(result.stale_seconds).toBeLessThan(120);
  });
});
