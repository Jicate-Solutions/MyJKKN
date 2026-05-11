import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkAssignService, BulkAssignError } from '../bulk-assign-service';
import { LeadService } from '../lead-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(),
}));
vi.mock('../lead-service', () => ({
  LeadService: { assignCounselor: vi.fn() },
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockSupabase(rpcResult: any = { data: [], error: null }, fromBuilder: any = null) {
  const supabase: any = {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    from: vi.fn().mockReturnValue(
      fromBuilder ?? {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { counselor_id: null }, error: null }),
      }
    ),
  };
  (createClientSupabaseClient as any).mockReturnValue(supabase);
  return supabase;
}

describe('BulkAssignService.assignAllToOne (Mode A)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loops assignCounselor for each lead', async () => {
    mockSupabase();
    (LeadService.assignCounselor as any).mockResolvedValue(undefined);

    const report = await BulkAssignService.assignAllToOne({
      leadIds: ['l1', 'l2', 'l3'],
      counselorId: 'c1',
    });

    expect(LeadService.assignCounselor).toHaveBeenCalledTimes(3);
    expect(report.successCount).toBe(3);
    expect(report.failureCount).toBe(0);
  });

  it('skips leads already assigned to a different counselor (invalid-stale)', async () => {
    mockSupabase(undefined, {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { counselor_id: 'other-counselor' }, error: null }),
    });
    (LeadService.assignCounselor as any).mockResolvedValue(undefined);

    const report = await BulkAssignService.assignAllToOne({
      leadIds: ['l1'],
      counselorId: 'c1',
    });

    expect(LeadService.assignCounselor).not.toHaveBeenCalled();
    expect(report.failureCount).toBe(1);
    expect(report.results[0].status).toBe('invalid-stale');
  });

  it('reports per-lead errors as failed without throwing', async () => {
    mockSupabase();
    (LeadService.assignCounselor as any)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const report = await BulkAssignService.assignAllToOne({
      leadIds: ['l1', 'l2', 'l3'],
      counselorId: 'c1',
    });

    expect(report.successCount).toBe(2);
    expect(report.failureCount).toBe(1);
    expect(report.failures[0].error).toBe('boom');
  });

  it('throws OVER_LIMIT for selection > 500', async () => {
    mockSupabase();
    const tooMany = Array.from({ length: 501 }, (_, i) => `lead-${i}`);
    await expect(
      BulkAssignService.assignAllToOne({ leadIds: tooMany, counselorId: 'c1' })
    ).rejects.toThrow(BulkAssignError);
  });

  it('throws EMPTY_INPUT for empty selection', async () => {
    mockSupabase();
    await expect(
      BulkAssignService.assignAllToOne({ leadIds: [], counselorId: 'c1' })
    ).rejects.toThrow(/No leads selected/);
  });
});

describe('BulkAssignService.autoRoute (Mode B)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls bulk_route_unassigned_leads RPC with the right args', async () => {
    const supabase = mockSupabase({
      data: [
        { lead_id: 'l1', counselor_id: 'c1', status: 'assigned', reason: null, plan_hash: 'hash1' },
        { lead_id: 'l2', counselor_id: null, status: 'no-candidate', reason: 'engine no-pick', plan_hash: 'hash1' },
      ],
      error: null,
    });

    const report = await BulkAssignService.autoRoute({
      leadIds: ['l1', 'l2'],
      dryRun: false,
      override: false,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('bulk_route_unassigned_leads', {
      p_lead_ids: ['l1', 'l2'],
      p_dry_run: false,
      p_override: false,
      p_expected_plan_hash: null,
    });
    expect(report.successCount).toBe(1);
    expect(report.failureCount).toBe(1);
    expect(report.planHash).toBe('hash1');
  });

  it('maps 42501 → PERMISSION_DENIED', async () => {
    mockSupabase({ data: null, error: { code: '42501', message: 'permission denied' } });

    await expect(
      BulkAssignService.autoRoute({ leadIds: ['l1'] })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('maps 40001 → STALE_PREVIEW', async () => {
    mockSupabase({ data: null, error: { code: '40001', message: 'plan drift' } });

    await expect(
      BulkAssignService.autoRoute({ leadIds: ['l1'] })
    ).rejects.toMatchObject({ code: 'STALE_PREVIEW' });
  });
});

describe('BulkAssignService.roundRobin (Mode C)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls bulk_round_robin_assign RPC with counselor list in given order', async () => {
    const supabase = mockSupabase({
      data: [
        { lead_id: 'l1', counselor_id: 'cA', status: 'assigned', reason: null, plan_hash: 'h' },
        { lead_id: 'l2', counselor_id: 'cB', status: 'assigned', reason: null, plan_hash: 'h' },
      ],
      error: null,
    });

    await BulkAssignService.roundRobin({
      leadIds: ['l1', 'l2'],
      counselorIds: ['cA', 'cB'],
      dryRun: true,
      override: false,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('bulk_round_robin_assign', {
      p_lead_ids: ['l1', 'l2'],
      p_counselor_ids: ['cA', 'cB'],
      p_dry_run: true,
      p_override: false,
      p_expected_plan_hash: null,
    });
  });

  it('throws EMPTY_INPUT when counselor list is empty', async () => {
    mockSupabase();
    await expect(
      BulkAssignService.roundRobin({ leadIds: ['l1'], counselorIds: [] })
    ).rejects.toThrow(/No counselors selected/);
  });
});
