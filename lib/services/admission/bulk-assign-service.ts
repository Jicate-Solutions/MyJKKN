// lib/services/admission/bulk-assign-service.ts
//
// Wraps the three bulk-distribution flows for the Distribute Unassigned
// Leads panel. Mode A loops the existing per-lead path; Modes B and C call
// SECURITY DEFINER RPCs that perform per-lead atomic assignment server-side.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LeadService } from '@/lib/services/admission/lead-service';
import { logger } from '@/lib/utils/enhanced-logger';

export type BulkAssignErrorCode =
  | 'PERMISSION_DENIED'
  | 'STALE_PREVIEW'
  | 'EMPTY_INPUT'
  | 'OVER_LIMIT'
  | 'UNKNOWN';

export class BulkAssignError extends Error {
  constructor(public code: BulkAssignErrorCode, message: string) {
    super(message);
    this.name = 'BulkAssignError';
  }
}

export interface PerLeadResult {
  lead_id: string;
  counselor_id: string | null;
  status: 'assigned' | 'no-candidate' | 'invalid-stale' | 'denied' | 'failed';
  reason?: string;
  error?: string;
}

export interface BulkAssignReport {
  total: number;
  successCount: number;
  failureCount: number;
  results: PerLeadResult[];
  failures: PerLeadResult[];
  planHash?: string;
}

const MAX_RUN_SIZE = 500;

function summarize(results: PerLeadResult[], planHash?: string): BulkAssignReport {
  const successCount = results.filter((r) => r.status === 'assigned').length;
  const failures = results.filter((r) => r.status !== 'assigned');
  return {
    total: results.length,
    successCount,
    failureCount: failures.length,
    results,
    failures,
    planHash,
  };
}

function mapDbError(err: any): BulkAssignError {
  if (err?.code === '42501') {
    return new BulkAssignError(
      'PERMISSION_DENIED',
      "You don't have permission to bulk-assign these leads."
    );
  }
  if (err?.code === '40001') {
    return new BulkAssignError(
      'STALE_PREVIEW',
      'Distribution plan changed since you previewed. Refresh and try again.'
    );
  }
  return new BulkAssignError('UNKNOWN', err?.message ?? 'Unexpected error');
}

export class BulkAssignService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // -------------------------------------------------------------------------
  // Mode A — Bulk-one (loops the existing single-lead path with stale-check)
  // -------------------------------------------------------------------------
  static async assignAllToOne(input: {
    leadIds: string[];
    counselorId: string;
    reason?: string;
    override?: boolean;
  }): Promise<BulkAssignReport> {
    if (input.leadIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No leads selected.');
    }
    if (input.leadIds.length > MAX_RUN_SIZE) {
      throw new BulkAssignError(
        'OVER_LIMIT',
        `Maximum ${MAX_RUN_SIZE} leads per run. Use filters to narrow your selection.`
      );
    }

    logger.info('bulk-assign', 'Run started', { mode: 'bulk-one', leadCount: input.leadIds.length });
    const startedAt = Date.now();
    const results: PerLeadResult[] = [];
    const supabase = BulkAssignService.supabase;

    for (const leadId of input.leadIds) {
      // Pre-check: lead may have been claimed by another user since the panel loaded
      const { data: cur, error: precheckErr } = await (supabase as any)
        .from('admission_leads')
        .select('counselor_id')
        .eq('id', leadId)
        .single();

      if (precheckErr) {
        results.push({ lead_id: leadId, counselor_id: null, status: 'failed', error: precheckErr.message });
        continue;
      }
      if (cur?.counselor_id && cur.counselor_id !== input.counselorId) {
        results.push({
          lead_id: leadId,
          counselor_id: null,
          status: 'invalid-stale',
          reason: 'Already assigned to another counselor',
        });
        continue;
      }

      try {
        await LeadService.assignCounselor(leadId, input.counselorId, undefined, {
          reason: input.reason,
          override: input.override,
        });
        results.push({ lead_id: leadId, counselor_id: input.counselorId, status: 'assigned' });
      } catch (err: any) {
        results.push({ lead_id: leadId, counselor_id: null, status: 'failed', error: err.message });
      }
    }

    const report = summarize(results);
    logger.info('bulk-assign', 'Run completed', {
      mode: 'bulk-one',
      successCount: report.successCount,
      failureCount: report.failureCount,
      durationMs: Date.now() - startedAt,
    });
    if (report.failureCount > 0) {
      logger.warn('bulk-assign', 'Partial failure', {
        mode: 'bulk-one',
        failures: report.failures.slice(0, 50),
      });
    }
    return report;
  }

  // -------------------------------------------------------------------------
  // Mode B — Auto-route (calls bulk_route_unassigned_leads RPC)
  // -------------------------------------------------------------------------
  static async autoRoute(input: {
    leadIds: string[];
    dryRun?: boolean;
    override?: boolean;
    expectedPlanHash?: string | null;
  }): Promise<BulkAssignReport> {
    if (input.leadIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No leads selected.');
    }
    if (input.leadIds.length > MAX_RUN_SIZE) {
      throw new BulkAssignError(
        'OVER_LIMIT',
        `Maximum ${MAX_RUN_SIZE} leads per run. Use filters to narrow your selection.`
      );
    }

    logger.info('bulk-assign', 'Run started', {
      mode: 'auto-route',
      leadCount: input.leadIds.length,
      dryRun: input.dryRun ?? false,
    });
    const startedAt = Date.now();

    const { data, error } = await (BulkAssignService.supabase as any).rpc('bulk_route_unassigned_leads', {
      p_lead_ids: input.leadIds,
      p_dry_run: input.dryRun ?? false,
      p_override: input.override ?? false,
      p_expected_plan_hash: input.expectedPlanHash ?? null,
    });

    if (error) {
      logger.error('bulk-assign', 'Run failed', { mode: 'auto-route', code: error.code, error: error.message });
      throw mapDbError(error);
    }

    const results: PerLeadResult[] = (data ?? []).map((row: any) => ({
      lead_id: row.lead_id,
      counselor_id: row.counselor_id ?? null,
      status: row.status as PerLeadResult['status'],
      reason: row.reason ?? undefined,
    }));
    const planHash = data?.[0]?.plan_hash ?? undefined;

    const report = summarize(results, planHash);
    logger.info('bulk-assign', 'Run completed', {
      mode: 'auto-route',
      successCount: report.successCount,
      failureCount: report.failureCount,
      durationMs: Date.now() - startedAt,
    });
    return report;
  }

  // -------------------------------------------------------------------------
  // Mode C — Round-robin (calls bulk_round_robin_assign RPC)
  // -------------------------------------------------------------------------
  static async roundRobin(input: {
    leadIds: string[];
    counselorIds: string[];
    dryRun?: boolean;
    override?: boolean;
    expectedPlanHash?: string | null;
  }): Promise<BulkAssignReport> {
    if (input.leadIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No leads selected.');
    }
    if (input.counselorIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No counselors selected.');
    }
    if (input.leadIds.length > MAX_RUN_SIZE) {
      throw new BulkAssignError(
        'OVER_LIMIT',
        `Maximum ${MAX_RUN_SIZE} leads per run. Use filters to narrow your selection.`
      );
    }

    logger.info('bulk-assign', 'Run started', {
      mode: 'round-robin',
      leadCount: input.leadIds.length,
      counselorCount: input.counselorIds.length,
      dryRun: input.dryRun ?? false,
    });
    const startedAt = Date.now();

    const { data, error } = await (BulkAssignService.supabase as any).rpc('bulk_round_robin_assign', {
      p_lead_ids: input.leadIds,
      p_counselor_ids: input.counselorIds,
      p_dry_run: input.dryRun ?? false,
      p_override: input.override ?? false,
      p_expected_plan_hash: input.expectedPlanHash ?? null,
    });

    if (error) {
      logger.error('bulk-assign', 'Run failed', { mode: 'round-robin', code: error.code, error: error.message });
      throw mapDbError(error);
    }

    const results: PerLeadResult[] = (data ?? []).map((row: any) => ({
      lead_id: row.lead_id,
      counselor_id: row.counselor_id ?? null,
      status: row.status as PerLeadResult['status'],
      reason: row.reason ?? undefined,
    }));
    const planHash = data?.[0]?.plan_hash ?? undefined;

    const report = summarize(results, planHash);
    logger.info('bulk-assign', 'Run completed', {
      mode: 'round-robin',
      successCount: report.successCount,
      failureCount: report.failureCount,
      durationMs: Date.now() - startedAt,
    });
    return report;
  }
}
