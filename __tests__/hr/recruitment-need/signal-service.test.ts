import { vi, describe, it, expect } from 'vitest';
import { RecruitmentNeedSignalService } from '../../../lib/services/hr/recruitment-need/signal-service';

// ─── Mock Supabase client builder ───────────────────────────────────────────────

type MockChain = Record<string, (...args: any[]) => MockChain> & {
  _resolve?: any;
};

function createMockSupabase(overrides: {
  rpcResult?: { data: any; error: any };
  queryResult?: { data: any; error: any };
  insertResult?: { data: any; error: any };
  updateResult?: { data: any; error: any };
  deleteResult?: { data: any; error: any };
  upsertResult?: { data: any; error: any };
  userId?: string;
} = {}) {
  const {
    rpcResult = { data: null, error: null },
    queryResult = { data: [], error: null },
    insertResult = { data: {}, error: null },
    updateResult = { data: {}, error: null },
    deleteResult = { data: null, error: null },
    upsertResult = { data: {}, error: null },
    userId = 'user-123',
  } = overrides;

  // Chainable query builder — each method returns the builder,
  // except terminal methods (single/maybeSingle) which resolve.
  function makeQueryChain(result: { data: any; error: any }) {
    const chain: any = {};
    const methods = ['select', 'eq', 'is', 'order', 'insert', 'update', 'delete', 'upsert'];
    for (const m of methods) {
      chain[m] = vi.fn((..._args: any[]) => chain);
    }
    chain.single = vi.fn(() => Promise.resolve(result));
    chain.maybeSingle = vi.fn(() => Promise.resolve(result));
    // If no terminal is called, the chain itself acts as a thenable
    chain.then = (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  }

  const selectChain = makeQueryChain(queryResult);
  const insertChain = makeQueryChain(insertResult);
  const updateChain = makeQueryChain(updateResult);
  const deleteChain = makeQueryChain(deleteResult);
  const upsertChain = makeQueryChain(upsertResult);

  return {
    rpc: vi.fn((_fnName: string, _params?: any) => Promise.resolve(rpcResult)),
    from: vi.fn((_table: string) => ({
      select: vi.fn((..._args: any[]) => selectChain),
      insert: vi.fn((..._args: any[]) => insertChain),
      update: vi.fn((..._args: any[]) => updateChain),
      delete: vi.fn(() => deleteChain),
      upsert: vi.fn((..._args: any[]) => upsertChain),
    })),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: userId } }, error: null })
      ),
    },
  } as any;
}

// ─── computeSignal ──────────────────────────────────────────────────────────────

describe('RecruitmentNeedSignalService.computeSignal', () => {
  it('calls supabase.rpc with correct params', async () => {
    const mockResult = {
      id: 'cache-1',
      institution_id: 'inst-1',
      composite_score: 72,
      overall_status: 'amber',
    };
    const supabase = createMockSupabase({
      rpcResult: { data: mockResult, error: null },
    });

    const result = await RecruitmentNeedSignalService.computeSignal(supabase, {
      institution_id: 'inst-1',
      program_id: 'prog-1',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('fn_compute_recruitment_signal', {
      p_institution_id: 'inst-1',
      p_program_id: 'prog-1',
    });
    expect(result).toEqual(mockResult);
  });

  it('passes null for program_id when not provided', async () => {
    const supabase = createMockSupabase({
      rpcResult: { data: { id: 'cache-2' }, error: null },
    });

    await RecruitmentNeedSignalService.computeSignal(supabase, {
      institution_id: 'inst-1',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('fn_compute_recruitment_signal', {
      p_institution_id: 'inst-1',
      p_program_id: null,
    });
  });

  it('throws on supabase error', async () => {
    const supabase = createMockSupabase({
      rpcResult: { data: null, error: new Error('RPC failed') },
    });

    await expect(
      RecruitmentNeedSignalService.computeSignal(supabase, { institution_id: 'inst-1' })
    ).rejects.toThrow('RPC failed');
  });
});

// ─── computeInput ───────────────────────────────────────────────────────────────

describe('RecruitmentNeedSignalService.computeInput', () => {
  it('calls the correct RPC function for each input key', async () => {
    const expectedMappings: Record<string, string> = {
      sanctioned_gap: 'fn_compute_input_sanctioned_gap',
      sfr: 'fn_compute_input_sfr',
      specialization_gap: 'fn_compute_input_specialization_gap',
      workload: 'fn_compute_input_workload',
      projected_intake: 'fn_compute_input_projected_intake',
      attrition_pipeline: 'fn_compute_input_attrition_pipeline',
      peer_benchmark: 'fn_compute_input_peer_benchmark',
    };

    for (const [key, fnName] of Object.entries(expectedMappings)) {
      const supabase = createMockSupabase({
        rpcResult: { data: { input_key: key, status: 'green' }, error: null },
      });

      await RecruitmentNeedSignalService.computeInput(
        supabase,
        key as any,
        { institution_id: 'inst-1' }
      );

      expect(supabase.rpc).toHaveBeenCalledWith(fnName, {
        p_institution_id: 'inst-1',
        p_program_id: null,
      });
    }
  });

  it('throws for unknown input key', async () => {
    const supabase = createMockSupabase();
    await expect(
      RecruitmentNeedSignalService.computeInput(supabase, 'nonexistent' as any, {
        institution_id: 'inst-1',
      })
    ).rejects.toThrow('Unknown input key: nonexistent');
  });
});

// ─── getCachedSignals ───────────────────────────────────────────────────────────

describe('RecruitmentNeedSignalService.getCachedSignals', () => {
  it('returns data from hr_recruitment_signal_cache', async () => {
    const mockSignals = [
      { id: 's1', institution_id: 'inst-1', overall_status: 'green' },
    ];
    const supabase = createMockSupabase({
      queryResult: { data: mockSignals, error: null },
    });

    const result = await RecruitmentNeedSignalService.getCachedSignals(supabase);
    expect(result).toEqual(mockSignals);
    expect(supabase.from).toHaveBeenCalledWith('hr_recruitment_signal_cache');
  });

  it('applies institution_id filter', async () => {
    const supabase = createMockSupabase({
      queryResult: { data: [], error: null },
    });

    await RecruitmentNeedSignalService.getCachedSignals(supabase, {
      institution_id: 'inst-1',
    });

    // from() was called with correct table
    expect(supabase.from).toHaveBeenCalledWith('hr_recruitment_signal_cache');
  });

  it('returns empty array when data is null', async () => {
    const supabase = createMockSupabase({
      queryResult: { data: null, error: null },
    });

    const result = await RecruitmentNeedSignalService.getCachedSignals(supabase);
    expect(result).toEqual([]);
  });

  it('throws on supabase error', async () => {
    const supabase = createMockSupabase({
      queryResult: { data: null, error: new Error('Query failed') },
    });

    await expect(
      RecruitmentNeedSignalService.getCachedSignals(supabase)
    ).rejects.toThrow('Query failed');
  });
});

// ─── createSuppression ──────────────────────────────────────────────────────────

describe('RecruitmentNeedSignalService.createSuppression', () => {
  it('sets suppressed_by from auth user', async () => {
    const mockSuppression = {
      id: 'sup-1',
      institution_id: 'inst-1',
      suppressed_by: 'user-123',
      reason: 'Under review',
      suppress_until: '2026-12-31',
      is_active: true,
    };
    const supabase = createMockSupabase({
      insertResult: { data: mockSuppression, error: null },
      userId: 'user-123',
    });

    const result = await RecruitmentNeedSignalService.createSuppression(supabase, {
      institution_id: 'inst-1',
      reason: 'Under review',
      suppress_until: '2026-12-31',
    });

    expect(result).toEqual(mockSuppression);
    // Verify auth.getUser was called to get the userId
    expect(supabase.auth.getUser).toHaveBeenCalled();
  });

  it('throws on supabase insert error', async () => {
    const supabase = createMockSupabase({
      insertResult: { data: null, error: new Error('Insert failed') },
    });

    await expect(
      RecruitmentNeedSignalService.createSuppression(supabase, {
        institution_id: 'inst-1',
        reason: 'Test',
        suppress_until: '2026-12-31',
      })
    ).rejects.toThrow('Insert failed');
  });
});

// ─── unsnoozeSuppression ────────────────────────────────────────────────────────

describe('RecruitmentNeedSignalService.unsnoozeSuppression', () => {
  it('sets is_active=false and unsnoozed_at', async () => {
    const mockResult = {
      id: 'sup-1',
      is_active: false,
      unsnoozed_at: '2026-05-26T00:00:00.000Z',
      unsnoozed_reason: 'No longer needed',
    };
    const supabase = createMockSupabase({
      updateResult: { data: mockResult, error: null },
    });

    const result = await RecruitmentNeedSignalService.unsnoozeSuppression(
      supabase,
      'sup-1',
      'No longer needed'
    );

    expect(result.is_active).toBe(false);
    expect(result.unsnoozed_reason).toBe('No longer needed');
    expect(supabase.from).toHaveBeenCalledWith('hr_recruitment_signal_suppressions');
  });
});

// ─── createEscalation ───────────────────────────────────────────────────────────

describe('RecruitmentNeedSignalService.createEscalation', () => {
  it('sets escalated_by from auth user', async () => {
    const mockEscalation = {
      id: 'esc-1',
      institution_id: 'inst-1',
      escalated_by: 'user-456',
      reason: 'Urgent hiring',
      status: 'pending',
    };
    const supabase = createMockSupabase({
      insertResult: { data: mockEscalation, error: null },
      userId: 'user-456',
    });

    const result = await RecruitmentNeedSignalService.createEscalation(supabase, {
      institution_id: 'inst-1',
      reason: 'Urgent hiring',
    });

    expect(result.escalated_by).toBe('user-456');
    expect(supabase.auth.getUser).toHaveBeenCalled();
  });
});

// ─── updateEscalation ───────────────────────────────────────────────────────────

describe('RecruitmentNeedSignalService.updateEscalation', () => {
  it('sets resolved_by on resolve status', async () => {
    const mockResult = {
      id: 'esc-1',
      status: 'resolved',
      resolved_by: 'user-789',
      resolved_at: '2026-05-26T00:00:00.000Z',
      resolution_notes: 'Hired 2 faculty',
    };
    const supabase = createMockSupabase({
      updateResult: { data: mockResult, error: null },
      userId: 'user-789',
    });

    const result = await RecruitmentNeedSignalService.updateEscalation(
      supabase,
      'esc-1',
      { status: 'resolved', resolution_notes: 'Hired 2 faculty' }
    );

    expect(result.status).toBe('resolved');
    expect(result.resolved_by).toBe('user-789');
    expect(supabase.auth.getUser).toHaveBeenCalled();
  });

  it('sets resolved_by on dismissed status', async () => {
    const mockResult = {
      id: 'esc-2',
      status: 'dismissed',
      resolved_by: 'user-789',
    };
    const supabase = createMockSupabase({
      updateResult: { data: mockResult, error: null },
      userId: 'user-789',
    });

    const result = await RecruitmentNeedSignalService.updateEscalation(
      supabase,
      'esc-2',
      { status: 'dismissed' }
    );

    expect(result.status).toBe('dismissed');
    expect(supabase.auth.getUser).toHaveBeenCalled();
  });

  it('does NOT fetch auth user for non-resolve statuses', async () => {
    const mockResult = { id: 'esc-3', status: 'acknowledged' };
    const supabase = createMockSupabase({
      updateResult: { data: mockResult, error: null },
    });

    await RecruitmentNeedSignalService.updateEscalation(
      supabase,
      'esc-3',
      { status: 'acknowledged' }
    );

    // auth.getUser should NOT be called for acknowledged status
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });
});
