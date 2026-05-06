import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AccountTransitionPayload,
  AccountTransitionResult,
} from '@/types/admission';
import { logActivityForCurrentUser, AdmissionFeesActivityTemplates }
  from '@/lib/utils/activity-logger-client';

/**
 * Wraps admission_account_transition_with_bills SECURITY DEFINER RPC.
 *
 * The RPC does the atomic data work; this service emits the activity log
 * entries (which fire from the calling user's session, not from inside the
 * SECURITY DEFINER context — keeping audit trail honest about who did the
 * action).
 */
export class AccountTransitionService {
  static async transitionToAccount(payload: AccountTransitionPayload): Promise<AccountTransitionResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_account_transition_with_bills', {
      p_learner_id: payload.learner_id,
      p_required_documents: payload.required_documents,
      p_received_documents: payload.received_documents,
    });
    if (error) throw error;
    const result = data as AccountTransitionResult;

    // Activity logs — written from caller's session for honest audit
    await Promise.all([
      logActivityForCurrentUser({
        actionType: 'lifecycle.account_transition',
        resourceType: 'learner',
        resourceId: payload.learner_id,
        description: AdmissionFeesActivityTemplates.lifecycle.account_transition(result.bills_generated),
        metadata: { learner_id: payload.learner_id, bills_generated: result.bills_generated },
      }),
      ...payload.received_documents.map((d) =>
        logActivityForCurrentUser({
          actionType: 'documents.received',
          resourceType: 'learner',
          resourceId: payload.learner_id,
          description: AdmissionFeesActivityTemplates.documents.received(d.doc_type, d.received_via),
          metadata: { learner_id: payload.learner_id, doc_type: d.doc_type },
        }),
      ),
      result.bills_generated > 0
        ? logActivityForCurrentUser({
            actionType: 'bill.auto_generated',
            resourceType: 'learner',
            resourceId: payload.learner_id,
            description: AdmissionFeesActivityTemplates.bill.auto_generated(result.bills_generated),
            metadata: { learner_id: payload.learner_id, count: result.bills_generated },
          })
        : Promise.resolve(),
    ]);

    return result;
  }
}
