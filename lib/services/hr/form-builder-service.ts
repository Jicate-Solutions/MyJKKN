/**
 * HR Form-Builder Service (W3-M9 substrate).
 *
 * CRUD-style accessors backing `hr_forms` + `hr_form_submissions`.
 *
 * SCOPE — substrate only (2026-05-15):
 *   - CRUD on hr_forms rows (list / get / create / updateFormSchema /
 *     publishForm) — IMPLEMENTED.
 *   - Submission lifecycle (submitForm / listSubmissions / advanceSubmission)
 *     — STUB signatures that throw 'not yet implemented in W3-M9 substrate'.
 *     Real implementations require widget validation + workflow engine which
 *     ship in follow-up PRs.
 *
 * Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md §W3-M9
 *
 * Director-lock R5-Q2 (memory: project_wave3_hr_policy_lock_2026_05_15):
 *   Form-builder write paths are super_admin only. RLS on hr_forms enforces
 *   this at the DB level; the service just passes the SupabaseClient through
 *   so authenticated identity drives access.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ApprovalWorkflowStep,
  CreateFormInput,
  HrForm,
  HrFormSubmission,
  SubmissionFilters,
  Widget,
} from '@/types/hr-forms';

const NOT_IMPL =
  'not yet implemented in W3-M9 substrate; follow-up PR (widget validation + workflow engine)';

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
  // Submission lifecycle — STUBS (real impls in follow-up PRs)
  // -------------------------------------------------------------------------

  /**
   * Submit a form. STUB — real impl validates submission_data against the
   * form's widget schema, initializes the workflow at step 1, and writes the
   * first approval_history entry. Ships in follow-up PR.
   */
  async submitForm(
    _supabase: SupabaseClient,
    _formId: string,
    _data: Record<string, unknown>,
  ): Promise<HrFormSubmission> {
    throw new Error(NOT_IMPL);
  },

  /**
   * List submissions matching filters. STUB — real impl handles
   * RLS-aware pagination + optional joins to the form + submitter. Ships
   * in follow-up PR.
   */
  async listSubmissions(
    _supabase: SupabaseClient,
    _filters: SubmissionFilters,
  ): Promise<HrFormSubmission[]> {
    throw new Error(NOT_IMPL);
  },

  /**
   * Advance a submission through the workflow (approve / reject). STUB —
   * real impl resolves the next step from approval_workflow.steps[],
   * checks the actor's role permissions, appends to approval_history, and
   * fires notifications. Ships in follow-up PR.
   */
  async advanceSubmission(
    _supabase: SupabaseClient,
    _submissionId: string,
    _action: 'approve' | 'reject',
    _reason: string,
  ): Promise<HrFormSubmission> {
    throw new Error(NOT_IMPL);
  },
} as const;

export type FormBuilderService = typeof formBuilderService;
