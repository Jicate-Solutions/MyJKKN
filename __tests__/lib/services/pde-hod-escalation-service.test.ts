import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock supabase client + the policy reader.
//
// We mock `createServerSupabaseClient` so .from('user_role_assignments')
// .select().eq().eq().limit() returns whatever rows we stage. We mock
// `getHodBlockingEscalation` so we control the policy mode per test.
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
        _table: table,
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        limit: vi.fn(() =>
          Promise.resolve(state.selectResult ?? { data: [], error: null })
        ),
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve(buildSupabaseMock()),
}));

const getHodBlockingEscalationMock = vi.fn();
vi.mock('@/lib/services/pde-policy-reader', () => ({
  getHodBlockingEscalation: (instId?: string | null) =>
    getHodBlockingEscalationMock(instId),
}));

import { PDEHodEscalationService } from '@/lib/services/pde-hod-escalation-service';

beforeEach(() => {
  getHodBlockingEscalationMock.mockReset();
  for (const k of Object.keys(fromState)) delete fromState[k];
});

function stageRole(profileId: string | null) {
  fromState['user_role_assignments'] = {
    selectResult: {
      data: profileId ? [{ profile_id: profileId }] : [],
      error: null,
    },
  };
}

function stageRoleError() {
  fromState['user_role_assignments'] = {
    selectResult: { data: null, error: { message: 'boom' } },
  };
}

const baseInput = {
  learnerId: 'learner-1',
  blockedBy: 'hod-1',
  demonstrationId: 'demo-1',
  reason: 'capacity',
  institutionId: 'inst-1',
};

// ---------------------------------------------------------------------------
// respect_no
// ---------------------------------------------------------------------------

describe('PDEHodEscalationService — respect_no mode', () => {
  it('returns action=respect with no target and a clear notification', async () => {
    getHodBlockingEscalationMock.mockResolvedValueOnce('respect_no');

    const decision = await PDEHodEscalationService.resolveBlockAction(baseInput);

    expect(decision.action).toBe('respect');
    expect(decision.policyMode).toBe('respect_no');
    expect(decision.target).toBeUndefined();
    expect(decision.notification).toMatch(/respected/i);
    expect(decision.notification).toContain(baseInput.demonstrationId);
  });

  it('passes institutionId through to the policy reader', async () => {
    getHodBlockingEscalationMock.mockResolvedValueOnce('respect_no');

    await PDEHodEscalationService.resolveBlockAction({
      ...baseInput,
      institutionId: 'inst-42',
    });

    expect(getHodBlockingEscalationMock).toHaveBeenCalledWith('inst-42');
  });
});

// ---------------------------------------------------------------------------
// bypass_hod_to_coordinator
// ---------------------------------------------------------------------------

describe('PDEHodEscalationService — bypass_hod_to_coordinator mode', () => {
  it('resolves coordinator profile_id from user_role_assignments', async () => {
    getHodBlockingEscalationMock.mockResolvedValueOnce('bypass_hod_to_coordinator');
    stageRole('coord-1');

    const decision = await PDEHodEscalationService.resolveBlockAction(baseInput);

    expect(decision.action).toBe('bypass_to_coordinator');
    expect(decision.policyMode).toBe('bypass_hod_to_coordinator');
    expect(decision.target).toBe('coord-1');
    expect(decision.notification).toMatch(/coordinator/i);
    expect(decision.notification).toContain('coord-1');
  });

  it('falls back to placeholder when no coordinator row exists', async () => {
    getHodBlockingEscalationMock.mockResolvedValueOnce('bypass_hod_to_coordinator');
    stageRole(null);

    const decision = await PDEHodEscalationService.resolveBlockAction(baseInput);

    expect(decision.action).toBe('bypass_to_coordinator');
    expect(decision.target).toBe('coordinator_lookup_pending');
  });

  it('falls back to placeholder when supabase returns an error', async () => {
    getHodBlockingEscalationMock.mockResolvedValueOnce('bypass_hod_to_coordinator');
    stageRoleError();

    const decision = await PDEHodEscalationService.resolveBlockAction(baseInput);

    expect(decision.target).toBe('coordinator_lookup_pending');
  });
});

// ---------------------------------------------------------------------------
// dean_kpi
// ---------------------------------------------------------------------------

describe('PDEHodEscalationService — dean_kpi mode', () => {
  it('resolves dean profile_id from user_role_assignments', async () => {
    getHodBlockingEscalationMock.mockResolvedValueOnce('dean_kpi');
    stageRole('dean-1');

    const decision = await PDEHodEscalationService.resolveBlockAction(baseInput);

    expect(decision.action).toBe('log_to_dean_kpi');
    expect(decision.policyMode).toBe('dean_kpi');
    expect(decision.target).toBe('dean-1');
    expect(decision.notification).toMatch(/dean KPI dashboard/i);
    expect(decision.notification).toContain('dean-1');
  });

  it('falls back to placeholder when no dean row exists', async () => {
    getHodBlockingEscalationMock.mockResolvedValueOnce('dean_kpi');
    stageRole(null);

    const decision = await PDEHodEscalationService.resolveBlockAction(baseInput);

    expect(decision.target).toBe('dean_lookup_pending');
  });
});

// ---------------------------------------------------------------------------
// default fallback (unknown / missing policy value)
// ---------------------------------------------------------------------------

describe('PDEHodEscalationService — default fallback', () => {
  it('treats null policy as dean_kpi', async () => {
    getHodBlockingEscalationMock.mockResolvedValueOnce(null as any);
    stageRole('dean-fallback');

    const decision = await PDEHodEscalationService.resolveBlockAction(baseInput);

    expect(decision.action).toBe('log_to_dean_kpi');
    expect(decision.policyMode).toBe('dean_kpi');
    expect(decision.target).toBe('dean-fallback');
  });

  it('treats undefined institutionId as null when querying roles', async () => {
    getHodBlockingEscalationMock.mockResolvedValueOnce('dean_kpi');
    stageRole('dean-2');

    const decision = await PDEHodEscalationService.resolveBlockAction({
      learnerId: 'l',
      blockedBy: 'h',
      demonstrationId: 'd',
      reason: 'r',
    });

    expect(getHodBlockingEscalationMock).toHaveBeenCalledWith(null);
    expect(decision.target).toBe('dean-2');
  });
});
