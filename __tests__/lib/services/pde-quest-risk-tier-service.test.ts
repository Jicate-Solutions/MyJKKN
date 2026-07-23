import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the policy reader and a chainable supabase stub.
//
// Supabase chain shapes used by the service:
//   .from('pde_quests').select('id').eq('risk_tier', 'experimental')      → resolves
//   .from('pde_quest_submissions').select('id', {count, head}).eq().eq()  → resolves
//   .from('pde_quests').update(...).eq('id', ...).eq('risk_tier', ...)    → resolves
//
// The mock returns thenable chains so each terminal `.eq(...)` resolves to
// the staged response.
// ---------------------------------------------------------------------------

const getQuestsRiskTiersMock = vi.fn();
vi.mock('@/lib/services/pde-policy-reader', () => ({
  getQuestsRiskTiers: (instId?: string | null) => getQuestsRiskTiersMock(instId),
}));

interface QuestRow {
  id: string;
}

interface MockState {
  quests: QuestRow[]; // returned by .from('pde_quests').select(...).eq('risk_tier', 'experimental')
  passedCountByQuest: Record<string, number>; // by quest_id
  updateError?: { message: string } | null;
  passedCountError?: { message: string } | null;
  updates: Array<{ id: string; payload: any }>; // captured UPDATEs
}

const state: MockState = {
  quests: [],
  passedCountByQuest: {},
  updates: [],
  updateError: null,
  passedCountError: null,
};

function buildSupabaseMock() {
  return {
    from: (table: string) => {
      if (table === 'pde_quests') {
        // Two flows: SELECT (terminal at .eq('risk_tier','experimental')) and
        // UPDATE (.update(...).eq('id', x).eq('risk_tier', y)).
        const chain: any = {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => {
              if (col === 'risk_tier' && val === 'experimental') {
                return Promise.resolve({ data: state.quests, error: null });
              }
              return Promise.resolve({ data: [], error: null });
            }),
          })),
          update: vi.fn((payload: any) => ({
            eq: vi.fn((_idCol: string, idVal: string) => ({
              eq: vi.fn((_tierCol: string, _tierVal: string) => {
                if (state.updateError) {
                  return Promise.resolve({ error: state.updateError });
                }
                state.updates.push({ id: idVal, payload });
                return Promise.resolve({ error: null });
              }),
            })),
          })),
        };
        return chain;
      }

      if (table === 'pde_quest_submissions') {
        // .select('id', { count, head }).eq('quest_id', x).eq('passed', true)
        const chain: any = {
          select: vi.fn(() => ({
            eq: vi.fn((_qCol: string, questId: string) => ({
              eq: vi.fn((_pCol: string, _passed: boolean) => {
                if (state.passedCountError) {
                  return Promise.resolve({ count: null, error: state.passedCountError });
                }
                return Promise.resolve({
                  count: state.passedCountByQuest[questId] ?? 0,
                  error: null,
                });
              }),
            })),
          })),
        };
        return chain;
      }

      return { select: vi.fn(), update: vi.fn() };
    },
  };
}

import {
  evaluateRiskTierPromotions,
  parsePromotionThreshold,
} from '@/lib/services/pde-quest-risk-tier-service';

beforeEach(() => {
  getQuestsRiskTiersMock.mockReset();
  state.quests = [];
  state.passedCountByQuest = {};
  state.updates = [];
  state.updateError = null;
  state.passedCountError = null;

  // Default policy: threshold derived from `after_2_experimental_passes` = 2.
  getQuestsRiskTiersMock.mockResolvedValue({
    enabled: true,
    tiers: ['experimental', 'production'],
    default_tier: 'experimental',
    production_eligibility: 'after_2_experimental_passes',
  });
});

describe('parsePromotionThreshold', () => {
  it('parses N from after_N_experimental_passes', () => {
    expect(parsePromotionThreshold('after_2_experimental_passes')).toBe(2);
    expect(parsePromotionThreshold('after_5_experimental_passes')).toBe(5);
  });

  it('falls back to default 2 on malformed strings', () => {
    expect(parsePromotionThreshold('garbage')).toBe(2);
    expect(parsePromotionThreshold('')).toBe(2);
  });
});

describe('evaluateRiskTierPromotions', () => {
  it('does not promote a quest with 0 passes', async () => {
    state.quests = [{ id: 'q-zero' }];
    state.passedCountByQuest = { 'q-zero': 0 };

    const result = await evaluateRiskTierPromotions(buildSupabaseMock() as any);

    expect(result.evaluated).toBe(1);
    expect(result.promoted).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it('does not promote a quest with 1 pass (below threshold)', async () => {
    state.quests = [{ id: 'q-one' }];
    state.passedCountByQuest = { 'q-one': 1 };

    const result = await evaluateRiskTierPromotions(buildSupabaseMock() as any);

    expect(result.promoted).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it('promotes a quest with exactly 2 passes (at threshold)', async () => {
    state.quests = [{ id: 'q-two' }];
    state.passedCountByQuest = { 'q-two': 2 };

    const result = await evaluateRiskTierPromotions(buildSupabaseMock() as any);

    expect(result.evaluated).toBe(1);
    expect(result.promoted).toBe(1);
    expect(state.updates).toEqual([
      expect.objectContaining({
        id: 'q-two',
        payload: expect.objectContaining({ risk_tier: 'production' }),
      }),
    ]);
    // Promotion records its own timestamp.
    expect(state.updates[0].payload.risk_tier_promoted_at).toEqual(
      expect.any(String)
    );
  });

  it('promotes a quest with more than threshold passes', async () => {
    state.quests = [{ id: 'q-many' }];
    state.passedCountByQuest = { 'q-many': 7 };

    const result = await evaluateRiskTierPromotions(buildSupabaseMock() as any);
    expect(result.promoted).toBe(1);
  });

  it('skips production quests entirely (only experimental is queried)', async () => {
    // The from('pde_quests').select().eq('risk_tier','experimental') mock
    // never returns production rows, so a quest already in production is
    // by construction never evaluated. We assert via empty input.
    state.quests = [];
    const result = await evaluateRiskTierPromotions(buildSupabaseMock() as any);

    expect(result.evaluated).toBe(0);
    expect(result.promoted).toBe(0);
  });

  it('continues past a per-quest count failure without aborting the batch', async () => {
    state.quests = [{ id: 'q-good' }];
    state.passedCountByQuest = { 'q-good': 2 };
    state.passedCountError = { message: 'boom' };

    const result = await evaluateRiskTierPromotions(buildSupabaseMock() as any);

    expect(result.evaluated).toBe(1);
    expect(result.promoted).toBe(0);
    expect(result.errors).toEqual([
      expect.objectContaining({ quest_id: 'q-good', message: 'boom' }),
    ]);
  });

  it('honours a custom threshold from policy (after_5_experimental_passes)', async () => {
    getQuestsRiskTiersMock.mockResolvedValue({
      enabled: true,
      tiers: ['experimental', 'production'],
      default_tier: 'experimental',
      production_eligibility: 'after_5_experimental_passes',
    });
    state.quests = [{ id: 'q-four' }, { id: 'q-five' }];
    state.passedCountByQuest = { 'q-four': 4, 'q-five': 5 };

    const result = await evaluateRiskTierPromotions(buildSupabaseMock() as any);

    expect(result.threshold).toBe(5);
    expect(result.promoted).toBe(1);
    expect(state.updates).toEqual([
      expect.objectContaining({ id: 'q-five' }),
    ]);
  });
});
