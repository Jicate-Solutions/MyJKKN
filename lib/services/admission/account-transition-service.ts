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
/**
 * One row of the pre-transition bill preview — one INSTALMENT, not one fee.
 * A fee split 30/30/40 contributes three rows sharing a category_id.
 */
export interface AccountBillPreviewRow {
  sort_order: number;
  category_id: string | null;
  category_name: string | null;
  item_amount: number;
  /** false = Campus Living / TMS owns this fee; no bill is raised here. */
  is_billable: boolean;
  owner_module: 'admission' | 'campus_living' | 'tms';
  instalment_no: number | null;
  instalment_count: number | null;
  instalment_amount: number | null;
  /** Effective share of the fee, derived from the amount the engine produced. */
  share_percent: number | null;
  due_date: string | null;
  /** Lifecycle status settling THIS instalment promotes the learner to. */
  promotes_to_status_code: string | null;
  matched_source: 'item_schedule' | 'item_single' | 'plan' | 'default' | null;
}

export class AccountTransitionService {
  /**
   * The exact bills transitionToAccount would raise, without raising them.
   *
   * Reads through admission_preview_account_bills, which runs the SAME split
   * engine and the SAME skip rule as generation — so the dialog cannot promise
   * something different from what commits. Writes nothing: the underlying fee
   * resolution is the pure compute variant, so cancelling the dialog leaves no
   * fee_items snapshot behind.
   *
   * Due dates anchored on an offset are computed from TODAY. Previewing on one
   * day and confirming on the next shifts them by a day — which is correct, and
   * why the preview is fetched fresh each time the dialog opens.
   */
  static async previewBills(learnerId: string): Promise<AccountBillPreviewRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_preview_account_bills', {
      p_learner_id: learnerId,
    });
    // Surfaced, never swallowed: an empty preview and a failed preview must not
    // look the same to the admin, because one of them means "confirming will be
    // rejected" and the other means "we could not tell".
    if (error) throw error;
    return (data ?? []) as AccountBillPreviewRow[];
  }

  static async transitionToAccount(payload: AccountTransitionPayload & {
    /** Optional per-Confirm session UUID. When provided, the RPC dedupes
     *  on it — rapid double-clicks pass the same key and the RPC returns
     *  the stored result instead of re-firing. Generated client-side by
     *  AccountVerificationDialog. */
    idempotency_key?: string;
    /** Optional admin-entered notes captured in the verification dialog.
     *  Stored on learners_profiles.account_verification_notes for audit. */
    notes?: string;
  }): Promise<AccountTransitionResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_account_transition_with_bills', {
      p_learner_id: payload.learner_id,
      p_required_documents: payload.required_documents,
      p_received_documents: payload.received_documents,
      // 2026-05-21 (Phase 2 of verification rollout): new optional params.
      // Existing callers that don't pass these continue to work — the RPC
      // defaults both to NULL.
      p_idempotency_key: payload.idempotency_key ?? null,
      p_notes: payload.notes ?? null,
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
