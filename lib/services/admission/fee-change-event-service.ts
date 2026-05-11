import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionFeeChangeEvent,
  AdmissionFeeChangeEventWithLines,
  ApproveFeeChangeEventDecisionInput,
  ApproveFeeChangeEventResult,
} from '@/types/admission';
import { logActivityForCurrentUser, AdmissionFeesActivityTemplates } from '@/lib/utils/activity-logger-client';

export class FeeChangeEventService {
  static async listPending(institutionId?: string): Promise<AdmissionFeeChangeEvent[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('admission_fee_change_events')
      .select('*, learner:learners_profiles!inner(institution_id)')
      .eq('status', 'pending_review')
      .order('requested_at', { ascending: false });
    if (institutionId) {
      query = query.eq('learner.institution_id', institutionId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as AdmissionFeeChangeEvent[];
  }

  static async getWithLines(eventId: string): Promise<AdmissionFeeChangeEventWithLines | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_change_events')
      .select('*, lines:admission_fee_change_event_lines(*)')
      .eq('id', eventId)
      .maybeSingle();
    if (error) throw error;
    return (data as AdmissionFeeChangeEventWithLines | null) ?? null;
  }

  static async approve(
    eventId: string,
    decisions: ApproveFeeChangeEventDecisionInput[],
    refundExcess = false,
  ): Promise<ApproveFeeChangeEventResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_approve_fee_change_event', {
      p_event_id: eventId,
      p_line_decisions: decisions,
      p_refund_excess: refundExcess,
    });
    if (error) throw error;
    const result = data as ApproveFeeChangeEventResult;

    // Activity log from caller's session (canonical object form)
    await logActivityForCurrentUser({
      actionType: 'fee_change_event.approved',
      resourceType: 'fee_change_event',
      resourceId: eventId,
      description: AdmissionFeesActivityTemplates.fee_change_event.approved(result.summary.new_bills, result.summary.superseded_bills),
      metadata: { event_id: eventId, summary: result.summary },
    });

    return result;
  }

  static async reject(eventId: string, notes: string): Promise<AdmissionFeeChangeEvent> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_change_events')
      .update({
        status: 'rejected',
        reason_notes: notes,
        decided_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .select('*')
      .single();
    if (error) throw error;

    await logActivityForCurrentUser({
      actionType: 'fee_change_event.rejected',
      resourceType: 'fee_change_event',
      resourceId: eventId,
      description: AdmissionFeesActivityTemplates.fee_change_event.rejected(notes),
      metadata: { event_id: eventId, reason: notes },
    });

    return data;
  }

  /** Used by OnboardingService.markAsApproved as a precondition check. */
  static async hasPendingForLearner(learnerId: string): Promise<boolean> {
    const supabase = createClientSupabaseClient();
    const { count, error } = await supabase
      .from('admission_fee_change_events')
      .select('id', { count: 'exact', head: true })
      .eq('learner_id', learnerId)
      .eq('status', 'pending_review');
    if (error) throw error;
    return (count ?? 0) > 0;
  }
}
