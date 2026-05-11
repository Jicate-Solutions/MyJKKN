// lib/services/admission/lead-stage-policy-service.ts
// ============================================================================
// Lead Stage Policy Service — config-row substrate (2026-05-07)
//
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
//
// This service backs the admin CRUD UI at /admin/lead-stages-policy. It exposes
// plain-English translation helpers following the same pattern as tier-policy-service.ts
// (PR #748 bar). Every user-visible string is written for non-technical readers.
//
// Table: lead_active_stage_policy (Phase 1A migration, separate PR)
// API:   /api/admin/lead-stages-policy (Phase 1C, separate PR)
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeadStageScopeType = 'global' | 'institution';

export interface LeadActiveStagePolicy {
  id: string;
  scope_type: LeadStageScopeType;
  institution_id: string | null;
  funnel_stage: string;
  is_terminal: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateLeadStagePolicyInput {
  scope_type: LeadStageScopeType;
  institution_id?: string | null;
  funnel_stage: string;
  is_terminal?: boolean;
  description?: string | null;
}

export interface UpdateLeadStagePolicyInput {
  scope_type?: LeadStageScopeType;
  institution_id?: string | null;
  funnel_stage?: string;
  is_terminal?: boolean;
  description?: string | null;
}

export interface StageLeadCount {
  funnel_stage: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LeadStagePolicyService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  /**
   * Fetch all lead stage policies. Optionally filter by institution.
   */
  static async getStagePolicies(
    institutionId?: string,
  ): Promise<LeadActiveStagePolicy[]> {
    let query = this.supabase
      .from('lead_active_stage_policy')
      .select('*')
      .order('scope_type', { ascending: false }) // global first, then institution
      .order('funnel_stage', { ascending: true });

    if (institutionId) {
      query = query.or(
        `scope_type.eq.global,institution_id.eq.${institutionId}`,
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/lead-stage-policy] Failed to fetch policies:', error);
      throw new Error("Couldn't load stage policies. Please try refreshing.");
    }

    return (data ?? []) as LeadActiveStagePolicy[];
  }

  /**
   * Create a new stage policy row.
   */
  static async createStagePolicy(
    input: CreateLeadStagePolicyInput,
  ): Promise<LeadActiveStagePolicy> {
    const payload: Record<string, unknown> = {
      scope_type: input.scope_type,
      institution_id:
        input.scope_type === 'global' ? null : input.institution_id ?? null,
      funnel_stage: input.funnel_stage,
      is_terminal: input.is_terminal ?? false,
      description: input.description ?? null,
    };

    const { data, error } = await this.supabase
      .from('lead_active_stage_policy')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[admission/lead-stage-policy] Failed to create policy:', error);
      throw new Error(error.message || "Couldn't save this stage policy.");
    }

    return data as LeadActiveStagePolicy;
  }

  /**
   * Update an existing stage policy. Only forwards fields the caller provided.
   */
  static async updateStagePolicy(
    id: string,
    input: UpdateLeadStagePolicyInput,
  ): Promise<LeadActiveStagePolicy> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.scope_type !== undefined) updateData.scope_type = input.scope_type;
    if (input.institution_id !== undefined)
      updateData.institution_id = input.institution_id;
    if (input.funnel_stage !== undefined)
      updateData.funnel_stage = input.funnel_stage;
    if (input.is_terminal !== undefined) updateData.is_terminal = input.is_terminal;
    if (input.description !== undefined)
      updateData.description = input.description;

    const { data, error } = await this.supabase
      .from('lead_active_stage_policy')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/lead-stage-policy] Failed to update policy:', error);
      throw new Error(error.message || "Couldn't update this stage policy.");
    }

    return data as LeadActiveStagePolicy;
  }

  /**
   * Convenience helper for the terminal toggle switch in the data table.
   */
  static async toggleTerminal(
    id: string,
    isTerminal: boolean,
  ): Promise<LeadActiveStagePolicy> {
    return this.updateStagePolicy(id, { is_terminal: isTerminal });
  }

  /**
   * Delete a stage policy row.
   */
  static async deleteStagePolicy(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('lead_active_stage_policy')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/lead-stage-policy] Failed to delete policy:', error);
      throw new Error("Couldn't remove this stage policy.");
    }
  }

  // ---------------------------------------------------------------------------
  // UI helpers — plain-English translation layer (Director bar: "any tom dick
  // and harry should be able to understand")
  // ---------------------------------------------------------------------------

  /**
   * Plain-English label for a funnel_stage value.
   * Engineering slug → human-readable label.
   *
   * Handles both snake_case slugs and unknown values gracefully.
   */
  static formatStage(stage: string): string {
    const known: Record<string, string> = {
      // Common admission funnel stages
      new:                     'New Lead',
      contacted:               'Contacted',
      not_reachable:           "Couldn't reach the lead",
      application_started:     'Application Started',
      application_submitted:   'Application Submitted',
      documents_pending:       'Documents Pending',
      documents_verified:      'Documents Verified',
      counseling_done:         'Counselling Done',
      fee_pending:             'Fee Pending',
      enrolled:                'Enrolled',
      lost:                    'Lost',
      junk:                    'Junk / Invalid',
      duplicate:               'Duplicate',
      deferred:                'Deferred to Next Year',
      on_hold:                 'On Hold',
      waitlisted:              'Waitlisted',
      interview_scheduled:     'Interview Scheduled',
      interview_done:          'Interview Done',
      offer_sent:              'Offer Sent',
      offer_accepted:          'Offer Accepted',
      offer_rejected:          'Offer Rejected',
    };

    if (known[stage]) return known[stage];

    // Fallback: convert snake_case to Title Case
    return stage
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Plain-English scope label.
   * "Applies to all colleges" or "Just for [College Name]"
   */
  static formatScope(
    scope: LeadStageScopeType,
    institutionName?: string | null,
  ): string {
    if (scope === 'global') return 'Applies to all colleges';
    return institutionName
      ? `Just for ${institutionName}`
      : 'Just for one college';
  }

  /**
   * Plain-English explanation of what the terminal flag means RIGHT NOW for
   * this stage, showing how many leads are currently affected.
   *
   * e.g. "Marked as terminal. 34 leads currently in this stage are EXCLUDED
   *        from counselor workload counts."
   */
  static explainTerminalToggle(isTerminal: boolean, currentLeadCount: number): string {
    const n = currentLeadCount;
    const nLabel = n === 1 ? '1 lead' : `${n} leads`;

    if (isTerminal) {
      return `Marked as terminal (done). ${nLabel} currently in this stage are NOT counted toward any counselor's active leads.`;
    }
    return `Marked as active. ${nLabel} currently in this stage ARE counted toward counselor workload caps.`;
  }

  /**
   * Warning shown BEFORE the user saves a terminal toggle change.
   * Explains the consequence of flipping the flag.
   */
  static consequencesIfToggle(
    currentIsTerminal: boolean,
    leadsInStage: number,
  ): string {
    const n = leadsInStage;
    const nLabel = n === 1 ? '1 lead' : `${n} leads`;

    if (!currentIsTerminal) {
      // Currently active → will become terminal
      return `If you save: counselors will FREE UP capacity for ${nLabel} that are currently in this stage. Those leads will stop counting toward workload caps — counselors can receive more new leads.`;
    }
    // Currently terminal → will become active
    return `If you save: ${nLabel} currently in this stage will START counting toward counselor workload caps. Counselors may reach their active-leads limit sooner.`;
  }

  /**
   * Short badge label for terminal state — used in table column.
   */
  static terminalBadgeLabel(isTerminal: boolean): string {
    return isTerminal ? 'Terminal (excluded)' : 'Active (counted)';
  }

  /**
   * Common funnel stages for the form dialog select — used to pre-populate
   * the funnel_stage dropdown with known values.
   */
  static readonly KNOWN_FUNNEL_STAGES: ReadonlyArray<{
    value: string;
    label: string;
  }> = [
    { value: 'new',                   label: 'New Lead' },
    { value: 'contacted',             label: 'Contacted' },
    { value: 'not_reachable',         label: "Couldn't reach the lead" },
    { value: 'application_started',   label: 'Application Started' },
    { value: 'application_submitted', label: 'Application Submitted' },
    { value: 'documents_pending',     label: 'Documents Pending' },
    { value: 'documents_verified',    label: 'Documents Verified' },
    { value: 'counseling_done',       label: 'Counselling Done' },
    { value: 'fee_pending',           label: 'Fee Pending' },
    { value: 'enrolled',              label: 'Enrolled' },
    { value: 'lost',                  label: 'Lost' },
    { value: 'junk',                  label: 'Junk / Invalid' },
    { value: 'duplicate',             label: 'Duplicate' },
    { value: 'deferred',              label: 'Deferred to Next Year' },
    { value: 'on_hold',               label: 'On Hold' },
    { value: 'waitlisted',            label: 'Waitlisted' },
    { value: 'interview_scheduled',   label: 'Interview Scheduled' },
    { value: 'interview_done',        label: 'Interview Done' },
    { value: 'offer_sent',            label: 'Offer Sent' },
    { value: 'offer_accepted',        label: 'Offer Accepted' },
    { value: 'offer_rejected',        label: 'Offer Rejected' },
  ];
}
