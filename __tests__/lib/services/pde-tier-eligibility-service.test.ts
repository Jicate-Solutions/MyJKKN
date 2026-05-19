import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock supabase client + the policy reader.
// ---------------------------------------------------------------------------

type FromHandler = {
  selectResult?: { data: any; error: any };
};
const fromState: { [table: string]: FromHandler } = {};

function buildSupabaseMock() {
  return {
    from: (table: string) => {
      const state = fromState[table] ?? {};
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(() =>
          Promise.resolve(state.selectResult ?? { data: null, error: null })
        ),
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve(buildSupabaseMock()),
}));

const getTierEligibilityMock = vi.fn();
const getPerCollegeComplianceTargetsMock = vi.fn();
vi.mock('@/lib/services/pde-policy-reader', () => ({
  getTierEligibility: (instId?: string | null) => getTierEligibilityMock(instId),
  getPerCollegeComplianceTargets: (instId?: string | null) =>
    getPerCollegeComplianceTargetsMock(instId),
}));

import {
  PDETierEligibilityService,
  type CourseTier,
} from '@/lib/services/pde-tier-eligibility-service';

beforeEach(() => {
  getTierEligibilityMock.mockReset();
  getPerCollegeComplianceTargetsMock.mockReset();
  for (const k of Object.keys(fromState)) delete fromState[k];
});

function stagePolicy(tier_1: string, tier_2: string, tier_3: string) {
  getTierEligibilityMock.mockResolvedValueOnce({ tier_1, tier_2, tier_3 });
}

function stageTargets(targets: any) {
  getPerCollegeComplianceTargetsMock.mockResolvedValueOnce(targets);
}

// ---------------------------------------------------------------------------
// `open` mode — always eligible
// ---------------------------------------------------------------------------

describe('PDETierEligibilityService — open mode', () => {
  it.each<[CourseTier]>([[1], [2], [3]])(
    'tier %s: returns eligible=true with no reason',
    async (tier) => {
      stagePolicy('open', 'open', 'open');

      const decision = await PDETierEligibilityService.checkCourseEligibility({
        tier,
        learnerId: 'l1',
      });

      expect(decision.eligible).toBe(true);
      expect(decision.mode).toBe('open');
      expect(decision.reason).toBeUndefined();
    }
  );
});

// ---------------------------------------------------------------------------
// `not_eligible` mode — always blocked
// ---------------------------------------------------------------------------

describe('PDETierEligibilityService — not_eligible mode', () => {
  it.each<[CourseTier]>([[1], [2], [3]])(
    'tier %s: returns eligible=false with policy-block reason',
    async (tier) => {
      stagePolicy('not_eligible', 'not_eligible', 'not_eligible');

      const decision = await PDETierEligibilityService.checkCourseEligibility({
        tier,
        learnerId: 'l1',
      });

      expect(decision.eligible).toBe(false);
      expect(decision.mode).toBe('not_eligible');
      expect(decision.reason).toMatch(/policy-blocked/i);
      expect(decision.reason).toContain(`Tier ${tier}`);
    }
  );
});

// ---------------------------------------------------------------------------
// `after_tier_1_success` mode — needs prior_tier_1_passes >= 1
// ---------------------------------------------------------------------------

describe('PDETierEligibilityService — after_tier_1_success mode', () => {
  it.each<[CourseTier]>([[1], [2], [3]])(
    'tier %s: eligible when prior_tier_1_passes >= 1',
    async (tier) => {
      stagePolicy(
        'after_tier_1_success',
        'after_tier_1_success',
        'after_tier_1_success'
      );

      const decision = await PDETierEligibilityService.checkCourseEligibility({
        tier,
        learnerId: 'l1',
        learnerProfile: { prior_tier_1_passes: 1 },
      });

      expect(decision.eligible).toBe(true);
      expect(decision.mode).toBe('after_tier_1_success');
    }
  );

  it.each<[CourseTier]>([[1], [2], [3]])(
    'tier %s: NOT eligible when prior_tier_1_passes is 0 / undefined',
    async (tier) => {
      stagePolicy(
        'after_tier_1_success',
        'after_tier_1_success',
        'after_tier_1_success'
      );

      const decision = await PDETierEligibilityService.checkCourseEligibility({
        tier,
        learnerId: 'l1',
      });

      expect(decision.eligible).toBe(false);
      expect(decision.mode).toBe('after_tier_1_success');
      expect(decision.reason).toMatch(/at least 1 prior tier-1 pass/i);
    }
  );

  it('reports actual prior pass count in the reason', async () => {
    stagePolicy('after_tier_1_success', 'after_tier_1_success', 'after_tier_1_success');

    const decision = await PDETierEligibilityService.checkCourseEligibility({
      tier: 2,
      learnerId: 'l1',
      learnerProfile: { prior_tier_1_passes: 0 },
    });

    expect(decision.reason).toContain('learner has 0');
  });
});

// ---------------------------------------------------------------------------
// `natural_fit_only` mode — needs college targets
// ---------------------------------------------------------------------------

describe('PDETierEligibilityService — natural_fit_only mode', () => {
  it.each<[CourseTier]>([[1], [2], [3]])(
    'tier %s: eligible when college has compliance targets',
    async (tier) => {
      stagePolicy('natural_fit_only', 'natural_fit_only', 'natural_fit_only');
      stageTargets({
        engineering: ['judgment', 'problem_finding'],
        default: ['judgment'],
      });

      const decision = await PDETierEligibilityService.checkCourseEligibility({
        tier,
        learnerId: 'l1',
        learnerProfile: { college_slug: 'engineering' },
      });

      expect(decision.eligible).toBe(true);
      expect(decision.mode).toBe('natural_fit_only');
    }
  );

  it.each<[CourseTier]>([[1], [2], [3]])(
    'tier %s: NOT eligible when college_slug is missing',
    async (tier) => {
      stagePolicy('natural_fit_only', 'natural_fit_only', 'natural_fit_only');

      const decision = await PDETierEligibilityService.checkCourseEligibility({
        tier,
        learnerId: 'l1',
      });

      expect(decision.eligible).toBe(false);
      expect(decision.reason).toMatch(/learner college unknown/i);
      expect(getPerCollegeComplianceTargetsMock).not.toHaveBeenCalled();
    }
  );

  it('falls back to default targets when college slug not in map', async () => {
    stagePolicy('natural_fit_only', 'natural_fit_only', 'natural_fit_only');
    stageTargets({ default: ['judgment', 'credential'] });

    const decision = await PDETierEligibilityService.checkCourseEligibility({
      tier: 1,
      learnerId: 'l1',
      learnerProfile: { college_slug: 'unknown_college' },
    });

    expect(decision.eligible).toBe(true);
    expect(decision.mode).toBe('natural_fit_only');
  });

  it('NOT eligible when neither specific nor default targets exist', async () => {
    stagePolicy('natural_fit_only', 'natural_fit_only', 'natural_fit_only');
    stageTargets({});

    const decision = await PDETierEligibilityService.checkCourseEligibility({
      tier: 2,
      learnerId: 'l1',
      learnerProfile: { college_slug: 'mystery' },
    });

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toMatch(/no compliance targets/i);
  });

  it('NOT eligible when college maps to an empty array', async () => {
    stagePolicy('natural_fit_only', 'natural_fit_only', 'natural_fit_only');
    stageTargets({ medical: [] });

    const decision = await PDETierEligibilityService.checkCourseEligibility({
      tier: 1,
      learnerId: 'l1',
      learnerProfile: { college_slug: 'medical' },
    });

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toMatch(/no compliance targets/i);
  });
});

// ---------------------------------------------------------------------------
// Mixed policy — different mode per tier
// ---------------------------------------------------------------------------

describe('PDETierEligibilityService — mixed-mode policy (default seed shape)', () => {
  it('tier_1=natural_fit_only / tier_2=after_tier_1_success / tier_3=not_eligible — each tier honours its own mode', async () => {
    stagePolicy('natural_fit_only', 'after_tier_1_success', 'not_eligible');
    stageTargets({ medical: ['judgment'] });

    const tier1 = await PDETierEligibilityService.checkCourseEligibility({
      tier: 1,
      learnerId: 'l1',
      learnerProfile: { college_slug: 'medical', prior_tier_1_passes: 0 },
    });
    expect(tier1.eligible).toBe(true);
    expect(tier1.mode).toBe('natural_fit_only');

    stagePolicy('natural_fit_only', 'after_tier_1_success', 'not_eligible');
    const tier2 = await PDETierEligibilityService.checkCourseEligibility({
      tier: 2,
      learnerId: 'l1',
      learnerProfile: { prior_tier_1_passes: 2 },
    });
    expect(tier2.eligible).toBe(true);
    expect(tier2.mode).toBe('after_tier_1_success');

    stagePolicy('natural_fit_only', 'after_tier_1_success', 'not_eligible');
    const tier3 = await PDETierEligibilityService.checkCourseEligibility({
      tier: 3,
      learnerId: 'l1',
      learnerProfile: { prior_tier_1_passes: 5, college_slug: 'medical' },
    });
    expect(tier3.eligible).toBe(false);
    expect(tier3.mode).toBe('not_eligible');
  });
});

// ---------------------------------------------------------------------------
// modeForTier — unit-level fallback
// ---------------------------------------------------------------------------

describe('PDETierEligibilityService.modeForTier — fallback', () => {
  it('returns not_eligible when tier value is missing', () => {
    expect(
      PDETierEligibilityService.modeForTier({ tier_2: 'open' } as any, 1)
    ).toBe('not_eligible');
  });

  it('returns not_eligible when tier value is an unknown enum', () => {
    expect(
      PDETierEligibilityService.modeForTier(
        { tier_1: 'garbage', tier_2: 'open', tier_3: 'open' } as any,
        1
      )
    ).toBe('not_eligible');
  });
});

// ---------------------------------------------------------------------------
// loadLearnerProfile — supabase fail-soft
// ---------------------------------------------------------------------------

describe('PDETierEligibilityService.loadLearnerProfile', () => {
  it('returns the profile fields when supabase resolves', async () => {
    fromState['profiles'] = {
      selectResult: { data: { college_slug: 'pharmacy' }, error: null },
    };

    const profile = await PDETierEligibilityService.loadLearnerProfile('l-1');

    expect(profile.college_slug).toBe('pharmacy');
  });

  it('returns an empty object when supabase returns no row', async () => {
    fromState['profiles'] = {
      selectResult: { data: null, error: null },
    };

    const profile = await PDETierEligibilityService.loadLearnerProfile('l-1');

    expect(profile.college_slug).toBeUndefined();
  });
});
