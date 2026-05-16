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

// Maximum number of leads accepted in a single underlying RPC call.
// Exposed for the UI to compute progress / expected batch count. The Distribute
// panel auto-batches selections larger than this transparently, so users no
// longer hit the OVER_LIMIT error for the auto-route and round-robin modes.
export const MAX_RUN_SIZE = 500;

/**
 * Optional callback used by auto-route and round-robin to report incremental
 * progress when the selection is auto-batched. Called after each chunk
 * resolves with the cumulative `done` count out of `total` selected.
 */
export type BulkAssignProgressFn = (done: number, total: number) => void;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

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
      // Bulk-one is intentionally NOT auto-batched: it runs sequential per-lead
      // RPC calls (one stale-check + one assign), so 14k leads = 28k network
      // hops. Auto-route or round-robin scale much better for large pools.
      throw new BulkAssignError(
        'OVER_LIMIT',
        `Bulk-one is capped at ${MAX_RUN_SIZE} leads per run. For larger pools, use Auto-Route or Round-Robin — those modes auto-batch transparently.`,
      );
    }

    logger.info('bulk-assign', 'Run started', { mode: 'bulk-one', leadCount: input.leadIds.length });
    const startedAt = Date.now();
    const results: PerLeadResult[] = [];
    const supabase = BulkAssignService.supabase;

    // Look up the counselor's auth user_id ONCE so each per-lead assignCounselor
    // call can populate assigned_counselor_id (profiles.id). Without this the
    // RLS direct-assignment branch and the get_source_distribution analytics
    // RPC both miss the lead — KPIs show 0 even after a successful assignment.
    const { data: counselorRow } = await (supabase as any)
      .from('admission_counselors')
      .select('user_id')
      .eq('id', input.counselorId)
      .single();
    const counselorProfileId: string | undefined = counselorRow?.user_id ?? undefined;

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
        await LeadService.assignCounselor(leadId, input.counselorId, counselorProfileId, {
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
  // Auto-batches in chunks of MAX_RUN_SIZE so callers no longer need to
  // pre-narrow selections. Progress is surfaced via input.onProgress.
  // -------------------------------------------------------------------------
  static async autoRoute(input: {
    leadIds: string[];
    dryRun?: boolean;
    override?: boolean;
    expectedPlanHash?: string | null;
    onProgress?: BulkAssignProgressFn;
  }): Promise<BulkAssignReport> {
    if (input.leadIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No leads selected.');
    }

    const total = input.leadIds.length;
    const isDryRun = input.dryRun ?? false;

    // Dry-run only previews the FIRST batch — preview semantics don't make
    // sense across multiple plan hashes. The UI surfaces this via "Showing
    // first 500 of N" copy in the InstitutionSummary card.
    const batches = isDryRun
      ? [input.leadIds.slice(0, MAX_RUN_SIZE)]
      : chunk(input.leadIds, MAX_RUN_SIZE);

    logger.info('bulk-assign', 'Run started', {
      mode: 'auto-route',
      leadCount: total,
      batches: batches.length,
      dryRun: isDryRun,
    });
    const startedAt = Date.now();

    const allResults: PerLeadResult[] = [];
    let firstPlanHash: string | undefined;
    let processed = 0;

    for (let i = 0; i < batches.length; i += 1) {
      const batchIds = batches[i];
      // expectedPlanHash only gates batch 0; subsequent batches don't have a
      // pre-issued hash to compare against, so we pass null.
      const expected = i === 0 ? input.expectedPlanHash ?? null : null;

      const { data, error } = await (BulkAssignService.supabase as any).rpc(
        'bulk_route_unassigned_leads',
        {
          p_lead_ids: batchIds,
          p_dry_run: isDryRun,
          p_override: input.override ?? false,
          p_expected_plan_hash: expected,
        },
      );

      if (error) {
        logger.error('bulk-assign', 'Run failed', {
          mode: 'auto-route',
          batch: i,
          code: error.code,
          error: error.message,
        });
        throw mapDbError(error);
      }

      for (const row of (data ?? []) as any[]) {
        allResults.push({
          lead_id: row.lead_id,
          counselor_id: row.counselor_id ?? null,
          status: row.status as PerLeadResult['status'],
          reason: row.reason ?? undefined,
        });
      }

      if (i === 0) firstPlanHash = data?.[0]?.plan_hash ?? undefined;
      processed += batchIds.length;
      input.onProgress?.(processed, total);
    }

    const report = summarize(allResults, firstPlanHash);
    logger.info('bulk-assign', 'Run completed', {
      mode: 'auto-route',
      batches: batches.length,
      successCount: report.successCount,
      failureCount: report.failureCount,
      durationMs: Date.now() - startedAt,
    });
    return report;
  }

  // -------------------------------------------------------------------------
  // Mode C — Round-robin (calls bulk_round_robin_assign RPC)
  // Auto-batches in chunks of MAX_RUN_SIZE. Counselor cycling resets at the
  // start of each batch (the RPC tracks v_idx internally and we can't
  // currently pass a starting offset). For typical workloads where
  // batchSize >> counselorCount, the per-counselor totals still average out
  // within ~1 lead per counselor of perfectly-even distribution.
  // -------------------------------------------------------------------------
  static async roundRobin(input: {
    leadIds: string[];
    counselorIds: string[];
    dryRun?: boolean;
    override?: boolean;
    expectedPlanHash?: string | null;
    /**
     * Optional per-run cap on how many leads each counselor receives.
     * NULL/undefined = no cap (cycle until all leads assigned). When set,
     * each counselor stops accepting new leads in this run after they hit
     * the limit; remaining leads stay unassigned. NOTE: the cap is applied
     * PER BATCH server-side, so with auto-batching a counselor could receive
     * up to (limit × batchCount) leads total. To enforce a global cap, the
     * caller must pre-narrow the selection.
     */
    perCounselorLimit?: number | null;
    onProgress?: BulkAssignProgressFn;
  }): Promise<BulkAssignReport> {
    if (input.leadIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No leads selected.');
    }
    if (input.counselorIds.length === 0) {
      throw new BulkAssignError('EMPTY_INPUT', 'No counselors selected.');
    }

    const total = input.leadIds.length;
    const isDryRun = input.dryRun ?? false;
    const batches = isDryRun
      ? [input.leadIds.slice(0, MAX_RUN_SIZE)]
      : chunk(input.leadIds, MAX_RUN_SIZE);

    logger.info('bulk-assign', 'Run started', {
      mode: 'round-robin',
      leadCount: total,
      counselorCount: input.counselorIds.length,
      batches: batches.length,
      dryRun: isDryRun,
    });
    const startedAt = Date.now();

    const allResults: PerLeadResult[] = [];
    let firstPlanHash: string | undefined;
    let processed = 0;

    for (let i = 0; i < batches.length; i += 1) {
      const batchIds = batches[i];
      const expected = i === 0 ? input.expectedPlanHash ?? null : null;

      const { data, error } = await (BulkAssignService.supabase as any).rpc(
        'bulk_round_robin_assign',
        {
          p_lead_ids: batchIds,
          p_counselor_ids: input.counselorIds,
          p_dry_run: isDryRun,
          p_override: input.override ?? false,
          p_expected_plan_hash: expected,
          p_per_counselor_limit: input.perCounselorLimit ?? null,
        },
      );

      if (error) {
        logger.error('bulk-assign', 'Run failed', {
          mode: 'round-robin',
          batch: i,
          code: error.code,
          error: error.message,
        });
        throw mapDbError(error);
      }

      for (const row of (data ?? []) as any[]) {
        allResults.push({
          lead_id: row.lead_id,
          counselor_id: row.counselor_id ?? null,
          status: row.status as PerLeadResult['status'],
          reason: row.reason ?? undefined,
        });
      }

      if (i === 0) firstPlanHash = data?.[0]?.plan_hash ?? undefined;
      processed += batchIds.length;
      input.onProgress?.(processed, total);
    }

    const report = summarize(allResults, firstPlanHash);
    logger.info('bulk-assign', 'Run completed', {
      mode: 'round-robin',
      batches: batches.length,
      successCount: report.successCount,
      failureCount: report.failureCount,
      durationMs: Date.now() - startedAt,
    });
    return report;
  }
}
