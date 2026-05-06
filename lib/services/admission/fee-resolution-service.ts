import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ResolvedFeeItem,
  ResolveFeeItemsResult,
  FeeStructureMatrixDimensions,
  AdmissionFeeStructureWithItems,
} from '@/types/admission';
import { FeeStructureService } from './fee-structure-service';

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
   */
  static async previewMatchByDimensions(
    dims: FeeStructureMatrixDimensions,
  ): Promise<AdmissionFeeStructureWithItems | null> {
    return FeeStructureService.findByDimensions(dims);
  }
}
