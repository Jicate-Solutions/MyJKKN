import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionFeeAdjustment,
  CreateAdmissionFeeAdjustmentInput,
  UpdateAdmissionFeeAdjustmentInput,
  ResolvedFeeItem,
} from '@/types/admission';
import { logActivityForCurrentUser, AdmissionFeesActivityTemplates } from '@/lib/utils/activity-logger-client';

/**
 * CRUD for admission_fee_adjustments. Every mutation:
 *   1. Writes to the table
 *   2. Invokes admission_resolve_fee_items_for_lead RPC to recompute fee_items
 *   3. Logs activity
 *
 * Per project memory `feedback_supabase_mutations_must_check_error.md`,
 * every mutation explicitly destructures { error } and throws.
 */
export class FeeAdjustmentService {
  static async listForLearner(learnerId: string, includeReversed = false): Promise<AdmissionFeeAdjustment[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('admission_fee_adjustments')
      .select('*')
      .eq('learner_id', learnerId)
      .order('applied_at', { ascending: false });
    if (!includeReversed) query = query.eq('status', 'active');
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  static async create(input: CreateAdmissionFeeAdjustmentInput): Promise<AdmissionFeeAdjustment> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_adjustments')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;

    // Recompute fee_items via RPC
    await this.resolveAndPersist(input.learner_id);

    // Log activity
    await logActivityForCurrentUser(
      'fee_adjustment.added',
      AdmissionFeesActivityTemplates.fee_adjustment.added(input.reason_code, input.delta_amount),
      { learner_id: input.learner_id, adjustment_id: data.id },
    );
    return data;
  }

  static async update(id: string, input: UpdateAdmissionFeeAdjustmentInput): Promise<AdmissionFeeAdjustment> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_adjustments')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    await this.resolveAndPersist(data.learner_id);
    await logActivityForCurrentUser(
      'fee_adjustment.updated',
      AdmissionFeesActivityTemplates.fee_adjustment.updated(data.reason_code, data.delta_amount),
      { learner_id: data.learner_id, adjustment_id: id },
    );
    return data;
  }

  static async remove(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    // Read learner_id + reason_code first so we can log + resolve after delete
    const { data: row, error: readError } = await supabase
      .from('admission_fee_adjustments')
      .select('learner_id, reason_code')
      .eq('id', id)
      .single();
    if (readError) throw readError;

    const { error: deleteError } = await supabase
      .from('admission_fee_adjustments')
      .delete()
      .eq('id', id);
    if (deleteError) throw deleteError;

    await this.resolveAndPersist(row.learner_id);
    await logActivityForCurrentUser(
      'fee_adjustment.removed',
      AdmissionFeesActivityTemplates.fee_adjustment.removed(row.reason_code),
      { learner_id: row.learner_id, adjustment_id: id },
    );
  }

  /** Soft-revert: status='reversed' instead of delete (keeps audit trail). */
  static async reverse(id: string): Promise<AdmissionFeeAdjustment> {
    return this.update(id, { status: 'reversed' });
  }

  /** Wrap the RPC for callers that don't otherwise need the service. */
  static async resolveAndPersist(learnerId: string): Promise<ResolvedFeeItem[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_resolve_fee_items_for_lead', {
      p_learner_id: learnerId,
    });
    if (error) throw error;
    return (data as ResolvedFeeItem[]) ?? [];
  }
}
