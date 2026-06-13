import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ResolvedFeeItem,
  ResolveFeeItemsResult,
  FeeStructureMatrixDimensions,
  AdmissionFeeStructureWithItems,
} from '@/types/admission';
import { FeeStructureService } from './fee-structure-service';

// UUID shape check — accepts both v4 and any 8-4-4-4-12 hex pattern. Used as
// a defensive guard against transient form states that pass the literal
// string "undefined" or an empty string into a UUID-typed query filter.
// Postgres rejects those with 22P02 invalid_input_syntax_for_type_uuid; we
// short-circuit before the bad value ever reaches PostgREST.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function isValidDimensions(d: FeeStructureMatrixDimensions): boolean {
  return (
    isValidUuid(d.institution_id) &&
    isValidUuid(d.degree_id) &&
    isValidUuid(d.department_id) &&
    isValidUuid(d.programme_id) &&
    isValidUuid(d.quota_id) &&
    isValidUuid(d.community_category_id) &&
    isValidUuid(d.admission_year_id)
  );
}

export interface AdoptStructureResult {
  success: boolean;
  learnerId: string;
  items: ResolvedFeeItem[];
  itemCount: number;
  total: number;
}

/**
 * UI-facing facade over admission_resolve_fee_items_for_lead.
 *
 * Two consumer flows:
 *   1. Finance tab on enquiry edit — calls resolveForLearner whenever an
 *      adjustment changes OR when the matrix dimensions in the form change.
 *   2. Pre-submit confirmation dialog — calls resolveForLearner one last time
 *      to display the totals + line items the lead will be admitted with.
 *
 * The legacy_fee_mode short-circuit lives in the RPC, not here — this service
 * is honest about returning whatever the RPC says.
 */
export class FeeResolutionService {
  /** Calls the RPC and shapes the result. Persists fee_items on the learner. */
  static async resolveForLearner(learnerId: string): Promise<ResolveFeeItemsResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_resolve_fee_items_for_lead', {
      p_learner_id: learnerId,
    });
    if (error) throw error;
    const items = (data as ResolvedFeeItem[]) ?? [];
    const total = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    return { items, matched: items.length > 0, total };
  }

  /**
   * Pure read — does not mutate fee_items. Used by the no-match UI to show a
   * preview *before* the lead is saved.
   *
   * findByDimensions takes community_category_id as a SEPARATE second arg
   * (the junction `admission_fee_structure_communities` is keyed by it, so
   * it's filtered server-side via .eq instead of via the dims object).
   * Passing only `dims` here used to send `undefined` as the second arg,
   * which PostgREST serializes to the literal string "undefined" and the
   * DB rejects with 22P02 invalid_input_syntax_for_type_uuid. Fixed
   * 2026-05-20 by forwarding dims.community_category_id explicitly.
   *
   * Defensive guard (2026-05-20): even after fixing the signature, callers
   * sometimes pass a dim that's the LITERAL STRING "undefined" or an empty
   * string (transient render state, form-state mismatch, stale React Query
   * cache between save and refetch). The truthy check in callers' `isFullDims`
   * doesn't catch those because non-empty strings are truthy. We re-validate
   * every dim as a UUID-shaped string here and short-circuit to null instead
   * of letting the bad value reach Postgres as a 22P02 error in the console.
   */
  static async previewMatchByDimensions(
    dims: FeeStructureMatrixDimensions,
    yearOfStudy: number = 1,
  ): Promise<AdmissionFeeStructureWithItems | null> {
    if (!isValidDimensions(dims)) {
      // Silently return null — the UI's no-match empty state will render,
      // which is the correct UX while the user finishes filling dims.
      return null;
    }
    return FeeStructureService.findByDimensions(dims, dims.community_category_id, yearOfStudy);
  }

  /**
   * Atomically flip legacy_fee_mode=false + resolve fee_items, in one RPC.
   * Used by the "Fees Setup Pending" tab save flow to migrate a legacy
   * admitted row onto the new fee structure matrix.
   *
   * RPC raises (which Supabase surfaces as a PostgrestError) on:
   *   - permission_denied: caller lacks admission_fees.manage_adjustments
   *   - learner_not_found: bad UUID
   *   - adopt_structure_no_match: 8-dim lookup returned zero results
   * Caller should inspect error.message to branch toast messaging.
   */
  static async adoptStructureForLead(learnerId: string): Promise<AdoptStructureResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_adopt_structure_for_lead', {
      p_learner_id: learnerId,
    });
    if (error) throw error;

    const payload = (data ?? {}) as {
      success?: boolean;
      learner_id?: string;
      fee_items?: ResolvedFeeItem[];
      item_count?: number;
    };
    const items = payload.fee_items ?? [];
    const total = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    return {
      success: payload.success ?? false,
      learnerId: payload.learner_id ?? learnerId,
      items,
      itemCount: payload.item_count ?? items.length,
      total,
    };
  }
}
