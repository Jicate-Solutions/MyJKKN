/**
 * HR Form-Builder Service.
 *
 * CRUD-style accessors backing `hr_forms` + `hr_form_submissions`,
 * plus the workflow engine that progresses submissions through their
 * per-form approval chain.
 *
 * SCOPE — Wave 3 M9 substrate + workflow-engine follow-up (2026-05-15):
 *   - CRUD on hr_forms rows (list / get / create / updateFormSchema /
 *     updateFormWorkflow / publishForm) — IMPLEMENTED.
 *   - Submission lifecycle (submitForm / listSubmissions / advanceSubmission)
 *     — IMPLEMENTED in this follow-up PR. Notifications fan out via
 *     lib/services/hr/form-submission-notifications.ts.
 *
 * Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md §W3-M9
 *
 * Director-lock R5-Q2 (memory: project_wave3_hr_policy_lock_2026_05_15):
 *   Form-builder write paths are super_admin only. RLS on hr_forms enforces
 *   this at the DB level; the service just passes the SupabaseClient through
 *   so authenticated identity drives access.
 *
 * Director-lock R6-Q3:
 *   Each form has its own approval chain (per-form configured workflow).
 *   Steps live in hr_forms.approval_workflow.steps[] as an ordered array.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ApprovalHistoryEntry,
  ApprovalWorkflowStep,
  CreateFormInput,
  HrForm,
  HrFormSubmission,
  SubmissionFilters,
  SubmissionStatus,
  Widget,
} from '@/types/hr-forms';
import {
  notifyApproversForStep,
  notifySubmitterOfAction,
} from './form-submission-notifications';

export const formBuilderService = {
  // -------------------------------------------------------------------------
  // hr_forms CRUD — IMPLEMENTED
  // -------------------------------------------------------------------------

  /**
   * List all forms. If institutionId is provided, returns forms scoped to
   * that institution OR null-institution (global) forms. Otherwise returns
   * all forms visible to the caller (RLS enforces visibility).
   */
  async listForms(
    supabase: SupabaseClient,
    institutionId?: string,
  ): Promise<HrForm[]> {
    let q = supabase
      .from('hr_forms')
      .select('*')
      .order('form_title', { ascending: true });

    if (institutionId) {
      q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as HrForm[];
  },

  /** Fetch a single form by id. Returns null if not found / not visible. */
  async getForm(
    supabase: SupabaseClient,
    id: string,
  ): Promise<HrForm | null> {
    const { data, error } = await supabase
      .from('hr_forms')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as HrForm | null;
  },

  /** Fetch a single form by stable form_key. Returns null if not found. */
  async getFormByKey(
    supabase: SupabaseClient,
    formKey: string,
  ): Promise<HrForm | null> {
    const { data, error } = await supabase
      .from('hr_forms')
      .select('*')
      .eq('form_key', formKey)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as HrForm | null;
  },

  /**
   * Create a new form. RLS enforces super_admin/admin gate. Schema +
   * approval_workflow default to empty if not supplied.
   */
  async createForm(
    supabase: SupabaseClient,
    input: CreateFormInput,
  ): Promise<HrForm> {
    const payload = {
      form_key: input.form_key,
      form_title: input.form_title,
      description: input.description ?? null,
      classification: input.classification ?? 'major',
      schema: input.schema ?? { widgets: [] },
      approval_workflow: input.approval_workflow ?? { steps: [] },
      institution_id: input.institution_id ?? null,
      is_published: false,
    };

    const { data, error } = await supabase
      .from('hr_forms')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as HrForm;
  },

  /**
   * Save a draft schema edit. Lands in draft_schema column; form continues
   * to render the published schema until publishForm() is called. `reason`
   * is required for audit purposes (caller writes to hr_policy_audit_log
   * separately in follow-up PRs).
   */
  async updateFormSchema(
    supabase: SupabaseClient,
    id: string,
    schema: Widget[],
    reason: string,
  ): Promise<HrForm> {
    if (!reason?.trim()) {
      throw new Error('reason is required for schema edits (audit trail)');
    }
    const { data, error } = await supabase
      .from('hr_forms')
      .update({ draft_schema: { widgets: schema } })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HrForm;
  },

  /**
   * Save a draft approval-workflow edit.
   */
  async updateFormWorkflow(
    supabase: SupabaseClient,
    id: string,
    steps: ApprovalWorkflowStep[],
    reason: string,
  ): Promise<HrForm> {
    if (!reason?.trim()) {
      throw new Error('reason is required for workflow edits (audit trail)');
    }
    const { data, error } = await supabase
      .from('hr_forms')
      .update({ draft_approval_workflow: { steps } })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HrForm;
  },

  /**
   * Publish a form. Promotes draft_schema + draft_approval_workflow to the
   * live columns and flips is_published = true. Clears the draft columns
   * after the copy.
   */
  async publishForm(
    supabase: SupabaseClient,
    id: string,
    reason: string,
  ): Promise<HrForm> {
    if (!reason?.trim()) {
      throw new Error('reason is required for publish (audit trail)');
    }

    const current = await this.getForm(supabase, id);
    if (!current) throw new Error(`form ${id} not found`);

    const nextSchema = current.draft_schema ?? current.schema;
    const nextWorkflow = current.draft_approval_workflow ?? current.approval_workflow;

    const { data, error } = await supabase
      .from('hr_forms')
      .update({
        schema: nextSchema,
        approval_workflow: nextWorkflow,
        draft_schema: null,
        draft_approval_workflow: null,
        is_published: true,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HrForm;
  },

  // -------------------------------------------------------------------------
  // Submission lifecycle — workflow engine
  // -------------------------------------------------------------------------

  /**
   * Submit a form. Inserts an hr_form_submissions row with status='submitted'
   * + current_step=1, seeds approval_history with the 'submit' entry, then
   * fires the first-step notification.
   *
   * Caller must pass an authenticated SupabaseClient — the INSERT RLS policy
   * forces submitted_by = auth.uid().
   */
  async submitForm(
    supabase: SupabaseClient,
    formId: string,
    data: Record<string, unknown>,
    options?: {
      institutionId?: string | null;
      submissionUrlBase?: string;
    },
  ): Promise<HrFormSubmission> {
    // 1. Resolve the form (must be published to accept submissions).
    const form = await this.getForm(supabase, formId);
    if (!form) throw new Error(`form ${formId} not found`);
    if (!form.is_published) {
      throw new Error(`form ${form.form_key} is not published — cannot submit`);
    }

    // 2. Resolve the authenticated user (for submitted_by + audit trail).
    const { data: auth } = await supabase.auth.getUser();
    const submitterId = auth?.user?.id;
    if (!submitterId) {
      throw new Error('not authenticated — cannot submit form');
    }

    const firstStep = (form.approval_workflow.steps ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)[0];

    const now = new Date().toISOString();
    const history: ApprovalHistoryEntry[] = [
      {
        step: firstStep?.order ?? 1,
        action: 'submit',
        actor_id: submitterId,
        reason: 'Initial submission',
        at: now,
      },
    ];

    // 3. Decide initial status. If the workflow has zero steps we mark the
    // submission as 'approved' immediately (no approval gate exists).
    const initialStatus: SubmissionStatus =
      firstStep != null ? 'in_review' : 'approved';

    // 4. Insert the row.
    const insertPayload = {
      form_id: formId,
      submitted_by: submitterId,
      institution_id: options?.institutionId ?? form.institution_id ?? null,
      submission_data: data,
      current_step: firstStep?.order ?? 1,
      status: initialStatus,
      approval_history: history,
    };
    const { data: row, error } = await supabase
      .from('hr_form_submissions')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    const submission = row as HrFormSubmission;

    // 5. Fire the first-step notification (best-effort; never blocks return).
    if (firstStep) {
      const submitterName = await getProfileName(supabase, submitterId);
      const submissionUrl =
        (options?.submissionUrlBase ?? '/hr/admin/forms/submissions') +
        '/' +
        submission.id;
      try {
        await notifyApproversForStep(
          supabase,
          form,
          submission,
          firstStep,
          submitterName,
          'submitted_to_first_approver',
          submissionUrl,
        );
      } catch (err) {
        console.warn('[form-builder-service] first-approver notify failed', err);
      }
    }

    return submission;
  },

  /**
   * List submissions matching filters. RLS-aware: the SupabaseClient identity
   * controls which rows are visible (super_admin sees all, submitter sees own,
   * same-institution HR officers see institution-scoped rows).
   */
  async listSubmissions(
    supabase: SupabaseClient,
    filters: SubmissionFilters = {},
  ): Promise<HrFormSubmission[]> {
    let q = supabase
      .from('hr_form_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.form_id) q = q.eq('form_id', filters.form_id);
    if (filters.submitted_by) q = q.eq('submitted_by', filters.submitted_by);
    if (filters.institution_id) q = q.eq('institution_id', filters.institution_id);

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        q = q.in('status', filters.status);
      } else {
        q = q.eq('status', filters.status);
      }
    }

    if (filters.page && filters.pageSize) {
      const from = (filters.page - 1) * filters.pageSize;
      const to = from + filters.pageSize - 1;
      q = q.range(from, to);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as HrFormSubmission[];
  },

  /** Fetch a single submission by id, returning null if not visible. */
  async getSubmission(
    supabase: SupabaseClient,
    id: string,
  ): Promise<HrFormSubmission | null> {
    const { data, error } = await supabase
      .from('hr_form_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as HrFormSubmission | null;
  },

  /**
   * Advance a submission through the workflow.
   *
   * - `approve`: appends to approval_history. If a next step exists,
   *   moves current_step forward and notifies the next approver. If this
   *   was the last step, flips status to 'approved' and notifies the
   *   submitter with the final-approval template.
   * - `reject`: flips status to 'rejected', appends to history, notifies
   *   the submitter.
   *
   * The RLS UPDATE policy enforces that only super_admin / admin / same-
   * institution HR officers can advance.
   */
  async advanceSubmission(
    supabase: SupabaseClient,
    submissionId: string,
    action: 'approve' | 'reject',
    reason: string,
    options?: { submissionUrlBase?: string },
  ): Promise<HrFormSubmission> {
    if (!reason?.trim()) {
      throw new Error('reason is required when advancing a submission');
    }

    // 1. Load submission + form.
    const current = await this.getSubmission(supabase, submissionId);
    if (!current) throw new Error(`submission ${submissionId} not found`);

    if (current.status === 'approved' || current.status === 'rejected' || current.status === 'withdrawn') {
      throw new Error(`submission already ${current.status}; cannot advance`);
    }

    const form = await this.getForm(supabase, current.form_id);
    if (!form) throw new Error(`form ${current.form_id} not found`);

    // 2. Resolve actor identity (for history + notification copy).
    const { data: auth } = await supabase.auth.getUser();
    const actorId = auth?.user?.id ?? null;
    const actorName = actorId ? await getProfileName(supabase, actorId) : 'system';
    const submitterName = await getProfileName(supabase, current.submitted_by);

    const sortedSteps = (form.approval_workflow.steps ?? [])
      .slice()
      .sort((a, b) => a.order - b.order);

    const currentStepDef =
      sortedSteps.find((s) => s.order === current.current_step) ??
      sortedSteps[0] ??
      null;

    const now = new Date().toISOString();

    // 3. Compute next state.
    let nextStatus: SubmissionStatus = current.status;
    let nextStep = current.current_step;
    let event: 'approved_to_submitter' | 'rejected_to_submitter' | 'approved_final_to_submitter';
    let advancedStepDef: ApprovalWorkflowStep | null = null;

    if (action === 'reject') {
      nextStatus = 'rejected';
      event = 'rejected_to_submitter';
    } else {
      // approve
      const idx = sortedSteps.findIndex((s) => s.order === current.current_step);
      const next = idx >= 0 ? sortedSteps[idx + 1] : null;
      if (next) {
        nextStatus = 'in_review';
        nextStep = next.order;
        advancedStepDef = next;
        event = 'approved_to_submitter'; // submitter notified of step approval
      } else {
        // final approval
        nextStatus = 'approved';
        event = 'approved_final_to_submitter';
      }
    }

    // 4. Append history.
    const historyEntry: ApprovalHistoryEntry = {
      step: current.current_step,
      action,
      actor_id: actorId,
      reason,
      at: now,
    };
    const nextHistory: ApprovalHistoryEntry[] = [
      ...(current.approval_history ?? []),
      historyEntry,
    ];

    // 5. Persist.
    const { data: updated, error } = await supabase
      .from('hr_form_submissions')
      .update({
        status: nextStatus,
        current_step: nextStep,
        approval_history: nextHistory,
      })
      .eq('id', submissionId)
      .select()
      .single();
    if (error) throw error;
    const submission = updated as HrFormSubmission;

    // 6. Fire notifications — submitter first, then next approver if any.
    const submissionUrl =
      (options?.submissionUrlBase ?? '/hr/admin/forms/submissions') + '/' + submission.id;

    try {
      await notifySubmitterOfAction(
        supabase,
        form,
        submission,
        currentStepDef,
        event,
        actorName,
        reason,
        submitterName,
        submissionUrl,
      );
    } catch (err) {
      console.warn('[form-builder-service] submitter notify failed', err);
    }

    if (action === 'approve' && advancedStepDef) {
      try {
        await notifyApproversForStep(
          supabase,
          form,
          submission,
          advancedStepDef,
          submitterName,
          'submitted_to_next_approver',
          submissionUrl,
        );
      } catch (err) {
        console.warn('[form-builder-service] next-approver notify failed', err);
      }
    }

    return submission;
  },
} as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getProfileName(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .maybeSingle();
    return (data?.full_name as string) || 'a user';
  } catch {
    return 'a user';
  }
}

export type FormBuilderService = typeof formBuilderService;
