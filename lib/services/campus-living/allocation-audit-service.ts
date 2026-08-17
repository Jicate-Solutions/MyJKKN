import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  AllocationAuditRow,
  AllocationAuditFilters,
} from '@/types/campus-living-allocation-audit';

const LOG = 'campus-living/allocation-audit';

/**
 * Read-only conformance audit over hostel allocations. One RPC, whole set (684
 * active rows today, ~1.4s) — the page filters and computes its KPI cards from
 * that one payload, so a card total can never disagree with the table beneath
 * it the way two separate calls against a live DB would.
 */
export class AllocationAuditService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // PostgrestError extends Error, so JSON.stringify(err) is "{}" — logging the
  // raw object hides the code (42501 from the permission gate, 57014 from a
  // statement timeout) behind an empty payload.
  private static rpcErr(error: any) {
    return {
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      details: error?.details ?? null,
      hint: error?.hint ?? null,
    };
  }

  /**
   * Postgres `numeric` arrives over PostgREST as a STRING ("470000.00"), not a
   * number. Left raw it breaks every comparison and sums by concatenation, so
   * coerce at the boundary. `?? null` not `|| null` — a genuine 0 balance must
   * survive.
   */
  private static num(v: unknown): number {
    if (v === null || v === undefined) return 0;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  static async getAudit(
    filters: AllocationAuditFilters = {}
  ): Promise<AllocationAuditRow[]> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_hostel_allocation_audit',
      {
        p_hostel_type: filters.hostelType ?? null,
        p_institution_id: filters.institutionId ?? null,
        p_program_id: filters.programId ?? null,
        p_semester_id: filters.semesterId ?? null,
        p_status: filters.status ?? 'active',
        p_allocation_id: filters.allocationId ?? null,
      }
    );

    if (error) {
      logger.error(LOG, 'getAudit failed', this.rpcErr(error));
      throw new Error(error.message || 'Failed to load the allocation audit');
    }

    return (Array.isArray(data) ? data : []).map(
      (r: Record<string, unknown>) =>
        ({
          ...r,
          band_fee: r.band_fee === null ? null : this.num(r.band_fee),
          band_year_bill_count: this.num(r.band_year_bill_count),
          band_year_bill_paid: this.num(r.band_year_bill_paid),
          band_year_bill_balance: this.num(r.band_year_bill_balance),
          academic_bill_count: this.num(r.academic_bill_count),
          matched_fee_min:
            r.matched_fee_min === null ? null : this.num(r.matched_fee_min),
          matched_fee_max:
            r.matched_fee_max === null ? null : this.num(r.matched_fee_max),
          upgrade_bill_count: this.num(r.upgrade_bill_count),
          upgrade_bill_total: this.num(r.upgrade_bill_total),
          upgrade_bill_paid: this.num(r.upgrade_bill_paid),
          upgrade_bill_balance: this.num(r.upgrade_bill_balance),
        }) as AllocationAuditRow
    );
  }
}
