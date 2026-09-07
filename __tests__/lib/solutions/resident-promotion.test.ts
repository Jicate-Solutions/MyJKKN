import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// The weld between the Improvement Board and the Solutions Hub.
//
// The behaviour that matters MOST today is the empty case. Zero improvement
// ideas have ever reached 'verified' in production, so this service correctly
// returns nobody. A bare [] is indistinguishable from a broken query, which is
// exactly how a silent failure hides — so the diagnostics are asserted here as
// hard contract, not as a nicety.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function builder(name: string) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    like: () => chain,
    in: () => chain,
    eq: () => chain,
    // thenable: awaiting the chain resolves to the table contents
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: tables[name] ?? [], error: null }),
  };
  return chain;
}

const createBuilderSpy = vi.fn(async (input: Row) => ({ id: 'new-builder', ...input }));

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock('@/lib/services/solutions/builders-service', () => ({
  BuildersService: { createBuilder: (i: Row) => createBuilderSpy(i) },
}));

const { ResidentPromotionService, PROMOTION_QUALIFYING_STATUS } = await import(
  '@/lib/services/solutions/resident-promotion-service'
);

const RESIDENT = 'user-resident-1';

function seed(ideas: Row[], builders: Row[] = []) {
  tables.user_roles = [{ user_id: RESIDENT, custom_roles: { role_key: 'mech_resident' } }];
  tables.improvement_ideas = ideas;
  tables.sh_builders = builders;
  tables.profiles = [
    { id: RESIDENT, full_name: 'Test Resident', email: 'r@jkkn.ac.in', learner_id: 'learner-1', institution_id: 'inst-1' },
  ];
  tables.learners_profiles = [{ id: 'learner-1', roll_number: 'ME21001', department_id: 'dept-mech' }];
}

beforeEach(() => {
  createBuilderSpy.mockClear();
  for (const k of Object.keys(tables)) delete tables[k];
});

describe('promotion eligibility', () => {
  it('returns nobody, and says why, when no idea has been verified', async () => {
    // Mirrors production on 30 Aug 2026: 34 ideas, none past under_review.
    seed([
      { id: 'i1', author_id: RESIDENT, status: 'logged', verified_value_inr: null, verified_at: null },
      { id: 'i2', author_id: RESIDENT, status: 'under_review', verified_value_inr: null, verified_at: null },
      { id: 'i3', author_id: RESIDENT, status: 'withdrawn', verified_value_inr: null, verified_at: null },
    ]);

    const { candidates, diagnostics } = await ResidentPromotionService.getPromotionCandidates();

    expect(candidates).toHaveLength(0);
    expect(diagnostics.residents_total).toBe(1);
    expect(diagnostics.ideas_total).toBe(3);
    expect(diagnostics.ideas_qualifying).toBe(0);
    expect(diagnostics.ideas_by_status).toEqual({ logged: 1, under_review: 1, withdrawn: 1 });
    // The empty list must explain itself, and must name the gate.
    expect(diagnostics.blocking_reason).toBeTruthy();
    expect(diagnostics.blocking_reason).toContain(PROMOTION_QUALIFYING_STATUS);
  });

  it('lists a resident whose authored idea reached verified', async () => {
    seed([
      { id: 'i1', author_id: RESIDENT, status: 'verified', verified_value_inr: 12000, verified_at: '2026-08-30T00:00:00Z' },
    ]);

    const { candidates, diagnostics } = await ResidentPromotionService.getPromotionCandidates();

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      user_id: RESIDENT,
      name: 'Test Resident',
      roll_number: 'ME21001',
      role_key: 'mech_resident',
      verified_idea_count: 1,
      verified_value_inr: 12000,
    });
    expect(diagnostics.blocking_reason).toBeNull();
  });

  it('does not offer to promote someone who is already a builder', async () => {
    seed(
      [{ id: 'i1', author_id: RESIDENT, status: 'verified', verified_value_inr: null, verified_at: '2026-08-30T00:00:00Z' }],
      [{ user_id: RESIDENT, learner_id: 'learner-1' }],
    );

    const { candidates, diagnostics } = await ResidentPromotionService.getPromotionCandidates();

    expect(candidates).toHaveLength(0);
    expect(diagnostics.already_builders).toBe(1);
    expect(diagnostics.blocking_reason).toContain('already a builder');
  });

  it('ignores a verified idea authored by someone with no residency role', async () => {
    seed([
      { id: 'i1', author_id: 'some-other-user', status: 'verified', verified_value_inr: 5000, verified_at: '2026-08-30T00:00:00Z' },
    ]);

    const { candidates } = await ResidentPromotionService.getPromotionCandidates();
    expect(candidates).toHaveLength(0);
  });
});

describe('promoting', () => {
  it('refuses an ineligible learner and never writes a builder row', async () => {
    seed([{ id: 'i1', author_id: RESIDENT, status: 'logged', verified_value_inr: null, verified_at: null }]);

    await expect(ResidentPromotionService.promoteResident(RESIDENT)).rejects.toThrow(/not eligible/i);
    expect(createBuilderSpy).not.toHaveBeenCalled();
  });

  it('writes through the one existing insert path when eligible', async () => {
    seed([
      { id: 'i1', author_id: RESIDENT, status: 'verified', verified_value_inr: 9000, verified_at: '2026-08-30T00:00:00Z' },
    ]);

    await ResidentPromotionService.promoteResident(RESIDENT, 'robotics');

    expect(createBuilderSpy).toHaveBeenCalledTimes(1);
    const arg = createBuilderSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      name: 'Test Resident',
      user_id: RESIDENT,
      learner_id: 'learner-1',
      specialization: 'robotics',
    });
    expect(String(arg.bio)).toContain('mech_resident');
  });
});
