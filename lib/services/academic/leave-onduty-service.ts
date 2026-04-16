/**
 * lib/services/academic/leave-onduty-service.ts
 * Consolidated Leave/OnDuty Service (Family B — leaf nodes)
 * Merged: 2026-02-28
 *
 * Consolidates 4 leaf-node files into one class:
 *   - leave-onduty-flow-service.ts                  (LeaveOndutyFlowService)
 *   - leave-onduty-application-service.ts           (LeaveOndutyApplicationService)
 *   - leave-onduty-attendance-check-service.ts      (LeaveOndutyAttendanceCheckService)
 *   - leave-onduty-attendance-integration-service.ts (LeaveOndutyAttendanceIntegrationService)
 *
 * NOTE: leave-onduty-approval-service.ts is NOT merged here because the combined
 * total would exceed the 1,500-line limit. It remains a standalone service that
 * imports LeaveOndutyAttendanceIntegrationService from this file via the shim.
 *
 * Each original file is now a re-export compatibility shim.
 *
 * @module services/academic/leave-onduty-service
 * @created 2026-01-28 (original files)
 * @merged  2026-02-28
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  LeaveOndutyApprovalFlow,
  FlowCreationData,
  FlowFilters,
  UpdateFlowInput,
  ValidationResult,
  LeaveOndutyApplication,
  ApplicationFormData,
  ApplicationFilters,
  CreateApplicationInput,
  UpdateApplicationInput,
  FileRequirements,
  PeriodDetectionResult,
  TimetablePeriod,
  AvailableDateInfo,
  DEFAULT_VALIDATION_RULES,
  AttendanceUpdateRecord,
} from '@/types/leave-onduty';

import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';

// Helper to get untyped client for tables not yet in database.types.ts
const getSupabase = () => createClientSupabaseClient() as any;

// ─────────────────────────────────────────────────────────────────────────────
// Re-exported interfaces from leave-onduty-attendance-check-service.ts
// (kept here so external consumers can still import them from the shim)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApprovedLeaveInfo {
  learner_id: string;
  application_id: string;
  category: 'leave' | 'onduty';
  subcategory: string;
  selected_periods: any; // jsonb - can be array or object
  start_date: string;
  end_date: string;
  reason: string;
  attachment_url: string | null;
  // Computed field for display
  attendance_status: 'absent' | 'onduty';
}

export interface AttendancePreFillData {
  student_id: string;
  suggested_status: 'Present' | 'Absent' | 'OnDuty';
  has_approved_leave: boolean;
  leave_info?: ApprovedLeaveInfo;
  can_override: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

export class LeaveOndutyService {

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVAL FLOW MANAGEMENT (from leave-onduty-flow-service.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get applicable flow for an application context
   */
  static async getApplicableFlow(applicationContext: {
    institution_id: string;
    degree_id: string | null;
    department_id: string | null;
    program_id: string | null;
    semester_id: string | null;
    category: string;
    sub_category: string;
  }): Promise<LeaveOndutyApprovalFlow | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase.rpc('get_applicable_approval_flow', {
      p_institution_id: applicationContext.institution_id,
      p_degree_id: applicationContext.degree_id,
      p_department_id: applicationContext.department_id,
      p_program_id: applicationContext.program_id,
      p_semester_id: applicationContext.semester_id,
      p_category: applicationContext.category,
      p_sub_category: applicationContext.sub_category,
    });

    if (error) {
      console.error('Error getting applicable flow:', error);
      return null;
    }

    return data;
  }

  /**
   * Create a new approval flow
   */
  static async createFlow(
    flowData: FlowCreationData,
    createdBy: string
  ): Promise<LeaveOndutyApprovalFlow> {
    const supabase = getSupabase();

    // Validate flow configuration
    const validation = this.validateFlowConfiguration(flowData);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid flow configuration');
    }

    const { data, error } = await supabase
      .from('leave_onduty_approval_flows')
      .insert({
        ...flowData,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create flow: ${error.message}`);
    }

    return data;
  }

  /**
   * Update an existing flow
   */
  static async updateFlow(
    flowId: string,
    updateData: UpdateFlowInput
  ): Promise<LeaveOndutyApprovalFlow> {
    const supabase = getSupabase();

    // If updating flow_steps, validate
    if (updateData.flow_steps) {
      const validation = this.validateFlowSteps(updateData.flow_steps);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid flow steps');
      }
    }

    const { data, error } = await supabase
      .from('leave_onduty_approval_flows')
      .update(updateData)
      .eq('id', flowId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update flow: ${error.message}`);
    }

    return data;
  }

  /**
   * Get flows by institution with filters
   * If institutionId is empty/null, returns all flows (for super admin)
   */
  static async getFlowsByInstitution(
    institutionId: string | null | undefined,
    filters?: FlowFilters
  ): Promise<LeaveOndutyApprovalFlow[]> {
    const supabase = getSupabase();

    let query = supabase
      .from('leave_onduty_approval_flows')
      .select(
        `
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name),
        creator:profiles(id, full_name)
      `
      )
      .order('created_at', { ascending: false });

    // Filter by institution if provided (super admin can view all by not providing institutionId)
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    // Apply filters
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters?.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch flows: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get flow by ID
   */
  static async getFlowById(flowId: string): Promise<LeaveOndutyApprovalFlow> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('leave_onduty_approval_flows')
      .select(
        `
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name),
        creator:profiles(id, full_name)
      `
      )
      .eq('id', flowId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch flow: ${error.message}`);
    }

    return data;
  }

  /**
   * Deactivate a flow
   */
  static async deactivateFlow(flowId: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_approval_flows')
      .update({ is_active: false })
      .eq('id', flowId);

    if (error) {
      throw new Error(`Failed to deactivate flow: ${error.message}`);
    }
  }

  /**
   * Activate a flow
   */
  static async activateFlow(flowId: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_approval_flows')
      .update({ is_active: true })
      .eq('id', flowId);

    if (error) {
      throw new Error(`Failed to activate flow: ${error.message}`);
    }
  }

  /**
   * Delete a flow
   */
  static async deleteFlow(flowId: string): Promise<void> {
    const supabase = getSupabase();

    // Check if flow is being used by any pending applications
    const { count } = await supabase
      .from('leave_onduty_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (count && count > 0) {
      throw new Error(
        'Cannot delete flow that is being used by pending applications. Deactivate instead.'
      );
    }

    const { error } = await supabase
      .from('leave_onduty_approval_flows')
      .delete()
      .eq('id', flowId);

    if (error) {
      throw new Error(`Failed to delete flow: ${error.message}`);
    }
  }

  /**
   * Validate flow configuration
   */
  static validateFlowConfiguration(flowData: FlowCreationData): ValidationResult {
    // Validate flow steps
    if (!flowData.flow_steps || flowData.flow_steps.length === 0) {
      return {
        valid: false,
        error: 'Flow must have at least one approval step',
      };
    }

    // Validate flow steps structure
    const stepsValidation = this.validateFlowSteps(flowData.flow_steps);
    if (!stepsValidation.valid) {
      return stepsValidation;
    }

    // Validate category
    if (!['leave', 'onduty', 'all'].includes(flowData.category)) {
      return {
        valid: false,
        error: 'Invalid category. Must be "leave", "onduty", or "all"',
      };
    }

    // Validate flow type
    if (!['sequential', 'parallel'].includes(flowData.flow_type)) {
      return {
        valid: false,
        error: 'Invalid flow type. Must be "sequential" or "parallel"',
      };
    }

    return { valid: true };
  }

  /**
   * Validate flow steps
   * Updated to work with custom roles from custom_roles table
   */
  private static validateFlowSteps(steps: any[]): ValidationResult {
    // Check for duplicate step orders
    const stepOrders = steps.map((s) => s.step_order);
    const uniqueOrders = new Set(stepOrders);
    if (stepOrders.length !== uniqueOrders.size) {
      return {
        valid: false,
        error: 'Duplicate step orders found. Each step must have a unique order.',
      };
    }

    // Validate each step
    for (const step of steps) {
      if (!step.step_order || step.step_order < 1) {
        return {
          valid: false,
          error: 'Step order must be a positive number',
        };
      }

      // Validate role_id (UUID from custom_roles table)
      if (!step.role_id || typeof step.role_id !== 'string' || step.role_id.trim().length === 0) {
        return {
          valid: false,
          error: 'Each step must have a valid role selected',
        };
      }

      // Validate role_name
      if (!step.role_name || typeof step.role_name !== 'string' || step.role_name.trim().length === 0) {
        return {
          valid: false,
          error: 'Each step must have a role name',
        };
      }

      // Validate approver_ids (must be array, can be empty initially but should have at least one user)
      if (!Array.isArray(step.approver_ids)) {
        return {
          valid: false,
          error: 'Approver IDs must be an array',
        };
      }

      if (step.approver_ids.length === 0) {
        return {
          valid: false,
          error: 'Each step must have at least one approver selected',
        };
      }

      if (typeof step.is_required !== 'boolean') {
        return {
          valid: false,
          error: 'is_required must be a boolean value',
        };
      }
    }

    // Ensure steps are ordered consecutively starting from 1
    const sortedOrders = [...stepOrders].sort((a, b) => a - b);
    for (let i = 0; i < sortedOrders.length; i++) {
      if (sortedOrders[i] !== i + 1) {
        return {
          valid: false,
          error: 'Step orders must be consecutive starting from 1',
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check for conflicting flows
   */
  static async checkConflictingFlows(
    institutionId: string,
    departmentId: string | null,
    semesterId: string | null,
    category: string,
    subCategory: string | null
  ): Promise<LeaveOndutyApprovalFlow[]> {
    const supabase = getSupabase();

    let query = supabase
      .from('leave_onduty_approval_flows')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('category', category)
      .eq('is_active', true);

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    } else {
      query = query.is('department_id', null);
    }

    if (semesterId) {
      query = query.eq('semester_id', semesterId);
    } else {
      query = query.is('semester_id', null);
    }

    if (subCategory) {
      query = query.eq('sub_category', subCategory);
    } else {
      query = query.is('sub_category', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking conflicts:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get flow statistics
   */
  static async getFlowStatistics(
    institutionId: string
  ): Promise<{
    total_flows: number;
    active_flows: number;
    by_type: { sequential: number; parallel: number };
    by_category: { leave: number; onduty: number; all: number };
  }> {
    const supabase = getSupabase();

    const { data: flows } = await supabase
      .from('leave_onduty_approval_flows')
      .select('*')
      .eq('institution_id', institutionId);

    if (!flows) {
      return {
        total_flows: 0,
        active_flows: 0,
        by_type: { sequential: 0, parallel: 0 },
        by_category: { leave: 0, onduty: 0, all: 0 },
      };
    }

    const activeFlows = flows.filter((f) => f.is_active);

    return {
      total_flows: flows.length,
      active_flows: activeFlows.length,
      by_type: {
        sequential: flows.filter((f) => f.flow_type === 'sequential').length,
        parallel: flows.filter((f) => f.flow_type === 'parallel').length,
      },
      by_category: {
        leave: flows.filter((f) => f.category === 'leave').length,
        onduty: flows.filter((f) => f.category === 'onduty').length,
        all: flows.filter((f) => f.category === 'all').length,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPLICATION MANAGEMENT (from leave-onduty-application-service.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new leave/onduty application
   */
  static async createApplication(
    data: ApplicationFormData,
    learnerId: string,
    institutionId: string
  ): Promise<LeaveOndutyApplication> {
    const supabase = getSupabase();

    // Get learner details for department/semester/section
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('department_id, semester_id, section_id')
      .eq('id', learnerId)
      .single();

    if (learnerError || !learner) {
      throw new Error('Learner not found');
    }

    // Validate application data
    const validation = await this.validateApplicationData(data, learner.section_id, learner.semester_id);
    if (!validation.valid) {
      throw new Error(validation.error || 'Validation failed');
    }

    // Upload attachment if provided
    let attachmentUrl: string | null = null;
    if (data.attachment_file) {
      attachmentUrl = await this.uploadAttachment(
        data.attachment_file,
        institutionId,
        learnerId
      );
    }

    // Detect periods based on period_type
    const periodDetection = await this.getPeriodsForDate(
      learner.section_id,
      learner.semester_id,
      data.start_date,
      data.period_type
    );

    if (!periodDetection.valid) {
      throw new Error(periodDetection.error || 'Period detection failed');
    }

    // Determine selected periods
    const selectedPeriods =
      data.period_type === 'periodwise'
        ? data.selected_periods
        : periodDetection.periods;

    // Phase 2: sponsor-approval gate
    // Look up whether the selected sub_category requires sponsor pre-approval.
    // If yes, the learner must have provided a sponsor_id AND the application
    // starts in the sponsor-pending state (current_step = 0 is a convention
    // for "waiting for sponsor"; the academic chain starts at 1).
    const { data: subCatRow } = await supabase
      .from('leave_onduty_sub_categories')
      .select('requires_sponsor_approval')
      .eq('institution_id', institutionId)
      .eq('category', data.category)
      .eq('code', data.sub_category)
      .maybeSingle();

    const requiresSponsor = !!subCatRow?.requires_sponsor_approval;

    if (requiresSponsor && !data.sponsor_id) {
      throw new Error(
        'This sub-category requires sponsor approval. Please select the person you are working with.'
      );
    }

    // Create application
    const { data: application, error: createError } = await supabase
      .from('leave_onduty_applications')
      .insert({
        learner_id: learnerId,
        institution_id: institutionId,
        department_id: learner.department_id,
        semester_id: learner.semester_id,
        section_id: learner.section_id,
        category: data.category,
        sub_category: data.sub_category,
        start_date: data.start_date,
        end_date: data.end_date,
        period_type: data.period_type,
        selected_periods: selectedPeriods,
        reason: data.reason,
        attachment_url: attachmentUrl,
        status: 'pending',
        // When sponsor approval is required, start at step 0 (sponsor gate).
        // The academic chain (HOD → Principal) starts at step 1 once the
        // sponsor approves. This keeps the existing flow unchanged for
        // sub-categories that don't need sponsor approval.
        current_step: requiresSponsor ? 0 : 1,
        sponsor_id: requiresSponsor ? data.sponsor_id : null,
        sponsor_approval_status: requiresSponsor ? 'pending' : null,
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create application: ${createError.message}`);
    }

    return application;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPONSOR APPROVAL (Phase 2)
  // Sponsor = the person the learner is working with. Must approve the
  // application before the academic approval chain starts.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get applications awaiting sponsor approval for a specific sponsor.
   * RLS policy `sponsors_view_assigned` limits what the sponsor can see to
   * their own assigned applications, so this query is already scoped
   * correctly by the sponsor's auth context.
   */
  static async getPendingSponsorApprovals(
    sponsorId: string
  ): Promise<LeaveOndutyApplication[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        learner:learners_profiles(
          id, first_name, last_name, roll_number, register_number, student_email
        ),
        institution:institutions(id, name),
        department:departments(id, department_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        sponsor:profiles!leave_onduty_applications_sponsor_id_fkey(
          id, full_name, email, avatar_url
        )
        `
      )
      .eq('sponsor_id', sponsorId)
      .eq('sponsor_approval_status', 'pending')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[leave-onduty/sponsor] failed to fetch pending approvals', error);
      throw new Error(`Failed to fetch sponsor queue: ${error.message}`);
    }

    return (data as LeaveOndutyApplication[]) || [];
  }

  /**
   * Sponsor approves or rejects an application.
   *
   * On approve:
   *   - sponsor_approval_status = 'approved'
   *   - current_step advances from 0 → 1 (academic chain starts)
   *
   * On reject:
   *   - sponsor_approval_status = 'rejected'
   *   - application.status = 'rejected' (terminal state, no academic chain)
   */
  static async processSponsorApproval(input: {
    application_id: string;
    sponsor_id: string;
    decision: 'approved' | 'rejected';
    comments?: string;
  }): Promise<LeaveOndutyApplication> {
    const supabase = getSupabase();

    // Guard: only the assigned sponsor can act, and only on pending
    const { data: app, error: fetchError } = await supabase
      .from('leave_onduty_applications')
      .select('id, sponsor_id, sponsor_approval_status, status')
      .eq('id', input.application_id)
      .maybeSingle();

    if (fetchError || !app) {
      throw new Error('Application not found');
    }
    if (app.sponsor_id !== input.sponsor_id) {
      throw new Error('You are not the assigned sponsor for this application');
    }
    if (app.sponsor_approval_status !== 'pending') {
      throw new Error(
        `Sponsor approval already ${app.sponsor_approval_status}. Cannot act again.`
      );
    }
    if (app.status !== 'pending') {
      throw new Error(`Application is ${app.status}, cannot process sponsor action`);
    }

    const now = new Date().toISOString();
    const patch: Record<string, any> = {
      sponsor_approval_status: input.decision,
      sponsor_comments: input.comments?.trim() || null,
      sponsor_action_at: now,
    };

    if (input.decision === 'approved') {
      // Advance to the academic chain — step 1 is the first HOD/Principal etc.
      patch.current_step = 1;
    } else {
      // Sponsor rejection is terminal. No academic chain runs.
      patch.status = 'rejected';
    }

    const { data: updated, error: updateError } = await supabase
      .from('leave_onduty_applications')
      .update(patch)
      .eq('id', input.application_id)
      .select(
        `
        *,
        sponsor:profiles!leave_onduty_applications_sponsor_id_fkey(
          id, full_name, email, avatar_url
        )
        `
      )
      .single();

    if (updateError) {
      console.error('[leave-onduty/sponsor] failed to process sponsor action', updateError);
      throw new Error(`Failed to ${input.decision === 'approved' ? 'approve' : 'reject'}: ${updateError.message}`);
    }

    return updated as LeaveOndutyApplication;
  }

  /**
   * Search profiles eligible to be sponsors within a given institution.
   * Used by the learner application form sponsor picker.
   *
   * Eligible roles: any faculty/staff/admin/coordinator role. Students are
   * excluded because onduty work is typically supervised by an adult.
   */
  static async searchEligibleSponsors(params: {
    institutionId: string;
    query: string;
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      full_name: string;
      email: string;
      role: string;
      department_name?: string | null;
    }>
  > {
    const supabase = getSupabase();
    const q = params.query.trim();
    const limit = params.limit ?? 15;

    // Role allowlist — see memory note "Admission CRM - Schema" for role list;
    // 'student' and 'guest' are excluded. All other active roles in the profile
    // system are eligible sponsors.
    const eligibleRoles = [
      'super_admin',
      'administrator',
      'admin',
      'institution_admin',
      'principal',
      'hod',
      'faculty',
      'staff',
      'admission',
      'accounts',
      'coe',
      'coe_office',
      'counselor',
      'digital_coordinator',
      'event_coordinator',
    ];

    let query: any = supabase
      .from('profiles')
      .select('id, full_name, email, role, department_id')
      .eq('institution_id', params.institutionId)
      .in('role', eligibleRoles)
      .limit(limit);

    // Case-insensitive name/email search when query is provided
    if (q.length > 0) {
      query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[leave-onduty/sponsor] search failed', error);
      throw new Error(`Sponsor search failed: ${error.message}`);
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      department_name: null, // lookup-free for v1; can join later if needed
    }));
  }

  /**
   * Get applications by learner with filters
   */
  static async getApplicationsByLearner(
    learnerId: string,
    filters?: Partial<ApplicationFilters>
  ): Promise<LeaveOndutyApplication[]> {
    const supabase = getSupabase();

    let query: any = supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        institution:institutions(id, name),
        department:departments(id, department_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        approvals:leave_onduty_approvals(
          *,
          approver:profiles(id, full_name, email, avatar_url)
        )
      `
      )
      .eq('learner_id', learnerId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.start_date) {
      query = query.gte('start_date', filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte('end_date', filters.end_date);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    return (data as LeaveOndutyApplication[]) || [];
  }

  /**
   * Get applications by approver
   */
  static async getApplicationsByApprover(
    approverId: string,
    filters?: Partial<ApplicationFilters>
  ): Promise<LeaveOndutyApplication[]> {
    const supabase = getSupabase();

    // First get application IDs where user is an approver
    const { data: approvalIds } = await supabase
      .from('leave_onduty_approvals')
      .select('application_id')
      .eq('approver_id', approverId);

    if (!approvalIds || approvalIds.length === 0) {
      return [];
    }

    const applicationIds = approvalIds.map((a: { application_id: string }) => a.application_id);

    let query: any = supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        learner:learners_profiles(
          id,
          first_name,
          last_name,
          roll_number,
          register_number,
          student_email
        ),
        institution:institutions(id, name),
        department:departments(id, department_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        approvals:leave_onduty_approvals(
          *,
          approver:profiles(id, full_name, email, avatar_url)
        )
      `
      )
      .in('id', applicationIds)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters?.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }
    if (filters?.section_id) {
      query = query.eq('section_id', filters.section_id);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    return (data as LeaveOndutyApplication[]) || [];
  }

  /**
   * Get application details by ID
   */
  static async getApplicationDetails(
    applicationId: string
  ): Promise<LeaveOndutyApplication> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        learner:learners_profiles(
          id,
          first_name,
          last_name,
          roll_number,
          register_number,
          student_email
        ),
        institution:institutions(id, name),
        department:departments(id, department_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        approvals:leave_onduty_approvals(
          *,
          approver:profiles(id, full_name, email, avatar_url)
        )
      `
      )
      .eq('id', applicationId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch application: ${error.message}`);
    }

    return data as LeaveOndutyApplication;
  }

  /**
   * Cancel an application (learner only, pending status only)
   */
  static async cancelApplication(
    applicationId: string,
    learnerId: string
  ): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_applications')
      .update({ status: 'cancelled' })
      .eq('id', applicationId)
      .eq('learner_id', learnerId)
      .eq('status', 'pending');

    if (error) {
      throw new Error(`Failed to cancel application: ${error.message}`);
    }

    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        // Fetch application details for logging
        const { data: app } = await (supabase as any)
          .from('leave_onduty_applications')
          .select('institution_id')
          .eq('id', applicationId)
          .single();
        const template = AcademicActivityTemplates.leaveApplicationCancelled('Learner', 'on-duty');
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: applicationId,
          description: template.description,
          metadata: { sub_type: template.sub_type, learner_id: learnerId },
          institutionId: app?.institution_id,
        });
      } catch { /* never block */ }
    })();
  }

  /**
   * Delete a cancelled application permanently
   */
  static async deleteApplication(
    applicationId: string,
    learnerId: string
  ): Promise<void> {
    const supabase = getSupabase();

    // Only allow deleting cancelled applications
    const { error } = await supabase
      .from('leave_onduty_applications')
      .delete()
      .eq('id', applicationId)
      .eq('learner_id', learnerId)
      .eq('status', 'cancelled');

    if (error) {
      throw new Error(`Failed to delete application: ${error.message}`);
    }
  }

  /**
   * Validate application data before submission
   */
  static async validateApplicationData(
    data: ApplicationFormData,
    sectionId: string,
    semesterId: string
  ): Promise<ValidationResult> {
    // Validate date range
    const startDate = new Date(data.start_date);
    const endDate = new Date(data.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check max backdate
    const maxBackdate = new Date();
    maxBackdate.setDate(
      maxBackdate.getDate() - DEFAULT_VALIDATION_RULES.dates.maxBackdate
    );
    maxBackdate.setHours(0, 0, 0, 0);

    if (startDate < maxBackdate) {
      return {
        valid: false,
        error: `Cannot apply for dates more than ${DEFAULT_VALIDATION_RULES.dates.maxBackdate} days in the past`,
      };
    }

    // Check date range validity
    if (endDate < startDate) {
      return {
        valid: false,
        error: 'End date cannot be before start date',
      };
    }

    // Validate reason length
    if (data.reason.length > 500) {
      return {
        valid: false,
        error: 'Reason cannot exceed 500 characters',
      };
    }

    if (data.reason.trim().length < 1) {
      return {
        valid: false,
        error: 'Please provide a reason',
      };
    }

    // Validate file attachment requirements
    const dayCount = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    const fileReq = this.getFileRequirements(data.category, data.sub_category, dayCount);

    if (fileReq.required && !data.attachment_file) {
      return {
        valid: false,
        error: fileReq.reason,
      };
    }

    if (data.attachment_file) {
      if (data.attachment_file.size > fileReq.maxSize) {
        return {
          valid: false,
          error: `File size cannot exceed ${fileReq.maxSize / (1024 * 1024)}MB`,
        };
      }

      if (!fileReq.allowedTypes.includes(data.attachment_file.type)) {
        return {
          valid: false,
          error: 'File type not allowed. Only PDF, JPG, and PNG files are accepted',
        };
      }
    }

    // Validate period selection
    if (data.period_type === 'periodwise' && data.selected_periods.length === 0) {
      return {
        valid: false,
        error: 'Please select at least one period',
      };
    }

    // Validate timetable exists for selected dates
    const timetableValidation = await this.validateTimetableExists(
      sectionId,
      semesterId,
      data.start_date
    );
    if (!timetableValidation.valid) {
      return timetableValidation;
    }

    return { valid: true };
  }

  /**
   * Get file attachment requirements based on application type
   */
  static getFileRequirements(
    category: string,
    subCategory: string,
    dayCount: number
  ): FileRequirements {
    // File attachments are optional for both leave and on-duty applications.
    // Students may optionally upload a supporting document (e.g., medical certificate),
    // but it is no longer enforced as a required field.
    return {
      required: false,
      reason: '',
      maxSize: DEFAULT_VALIDATION_RULES.attachment.maxSize,
      allowedTypes: DEFAULT_VALIDATION_RULES.attachment.allowedTypes,
    };
  }

  /**
   * Get available dates with timetables for a section
   */
  static async getAvailableDatesForSection(
    sectionId: string,
    semesterId: string,
    startDate: string,
    endDate: string
  ): Promise<AvailableDateInfo[]> {
    const supabase = getSupabase();

    // Get active timetable for section (use maybeSingle to handle 0 rows gracefully)
    const { data: timetable } = await supabase
      .from('timetables')
      .select('*')
      .eq('section_id', sectionId)
      .eq('semester_id', semesterId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const dates: AvailableDateInfo[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      dates.push({
        date: dateStr,
        has_timetable: !!timetable && !isWeekend,
        total_periods: timetable ? Object.keys(timetable.timetable_data || {}).length : 0,
        is_weekend: isWeekend,
        is_holiday: false, // TODO: Check holiday calendar
      });
    }

    return dates;
  }

  /**
   * Get periods for a specific date based on period type
   */
  static async getPeriodsForDate(
    sectionId: string,
    semesterId: string,
    date: string,
    periodType: string
  ): Promise<PeriodDetectionResult> {
    const supabase = getSupabase();

    console.log('[LeaveOndutyService.getPeriodsForDate] Input:', {
      sectionId,
      semesterId,
      date,
      periodType,
    });

    // Get active timetable: try section-specific first, fall back to semester-only
    let timetable: any = null;
    let timetableError: any = null;

    // Try section + semester match first
    const { data: sectionTimetable, error: sectionErr } = await supabase
      .from('timetables')
      .select('*')
      .eq('section_id', sectionId)
      .eq('semester_id', semesterId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sectionTimetable) {
      timetable = sectionTimetable;
    } else {
      // Fallback: semester-only match (section_id is null on many timetables)
      const { data: semesterTimetable, error: semesterErr } = await supabase
        .from('timetables')
        .select('*')
        .is('section_id', null)
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      timetable = semesterTimetable;
      timetableError = sectionErr || semesterErr;
    }

    console.log('[LeaveOndutyService.getPeriodsForDate] Timetable query result:', {
      timetable: timetable ? { id: timetable.id, section_id: timetable.section_id, semester_id: timetable.semester_id, is_active: timetable.is_active } : null,
      timetableError,
      timetableDataKeys: timetable?.timetable_data ? Object.keys(timetable.timetable_data) : [],
    });

    if (timetableError) {
      console.log('[LeaveOndutyService.getPeriodsForDate] Query error:', timetableError);
      return {
        valid: false,
        periods: [],
        error: 'Failed to fetch timetable',
      };
    }

    if (!timetable) {
      console.log('[LeaveOndutyService.getPeriodsForDate] No timetable found for section/semester');
      return {
        valid: false,
        periods: [],
        error: 'No active timetable found for this section',
      };
    }

    const timetableData = timetable.timetable_data || {};

    // Get day of week from selected date
    const selectedDate = new Date(date);
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const dayOfWeek = dayNames[selectedDate.getDay()];

    console.log('[LeaveOndutyService.getPeriodsForDate] Date analysis:', {
      date,
      selectedDate: selectedDate.toISOString(),
      dayOfWeek,
      timetableDataKeys: Object.keys(timetableData),
    });

    // Extract periods for the specific day from timetable_data
    // Structure: { [day]: { [periodSlotId]: slotData } }
    let dayPeriods: Record<string, any> = {};

    // Check if timetable_data is day-based structure
    if (timetableData[dayOfWeek] && typeof timetableData[dayOfWeek] === 'object') {
      dayPeriods = timetableData[dayOfWeek];
    } else if (Array.isArray(timetableData)) {
      // Array format - filter by day
      timetableData.forEach((slot: any, index: number) => {
        if (slot.day === dayOfWeek) {
          const slotId = slot.slot_id || `slot-${index}`;
          dayPeriods[slotId] = slot;
        }
      });
    } else if (timetableData.slots && Array.isArray(timetableData.slots)) {
      // Object with slots array
      timetableData.slots.forEach((slot: any, index: number) => {
        if (slot.day === dayOfWeek) {
          const slotId = slot.slot_id || `slot-${index}`;
          dayPeriods[slotId] = slot;
        }
      });
    } else {
      // BUG-003207: the old fallback assigned the entire timetableData object
      // (which often has day-name keys like "FRIDAY", "MONDAY") into dayPeriods.
      // Those non-UUID keys then flowed into .in('id', allPeriodIds) and caused
      // "invalid input syntax for type uuid: FRIDAY" errors, surfacing as
      // "fake periods" in the UI. Prefer an empty result over mangled data.
      dayPeriods = {};
    }

    const allPeriodIds = Object.keys(dayPeriods);

    console.log('[LeaveOndutyService.getPeriodsForDate] Day periods:', {
      dayOfWeek,
      allPeriodsCount: allPeriodIds.length,
      allPeriodIds,
      samplePeriod: allPeriodIds.length > 0 ? dayPeriods[allPeriodIds[0]] : null,
    });

    if (allPeriodIds.length === 0) {
      return {
        valid: false,
        periods: [],
        error: `No classes scheduled for ${dayOfWeek}`,
        timetable: {},
      };
    }

    // Enrich periods with details from periods and courses tables
    // The key in dayPeriods is the period_id from the periods table
    // Each slot has course_id which we need to look up
    const courseIds = [...new Set(
      allPeriodIds
        .map(periodId => dayPeriods[periodId]?.course_id)
        .filter(Boolean)
    )];

    // Batch fetch period details (period_name, start_time, end_time, + clinic metadata).
    // BUG-003208: period_mode and practical_config are required so the UI can
    // render clinic posting blocks correctly; they were previously omitted.
    const { data: periodsData, error: periodsError } = await supabase
      .from('periods')
      .select('id, period_name, start_time, end_time, is_break, period_mode, practical_config')
      .in('id', allPeriodIds);

    if (periodsError) {
      console.warn('[LeaveOndutyService.getPeriodsForDate] Error fetching periods:', periodsError);
    }

    // Batch fetch course details (course_name, course_code)
    let coursesData: any[] = [];
    if (courseIds.length > 0) {
      const { data: courses, error: coursesError } = await supabase
        .from('courses')
        .select('id, course_name, course_code')
        .in('id', courseIds);

      if (coursesError) {
        console.warn('[LeaveOndutyService.getPeriodsForDate] Error fetching courses:', coursesError);
      } else {
        coursesData = courses || [];
      }
    }

    // Create lookup maps with proper typing
    const periodMap = new Map<string, { id: string; period_name: string; start_time: string; end_time: string; is_break: boolean }>(
      (periodsData || []).map((p: any) => [p.id, p])
    );
    const courseMap = new Map<string, { id: string; course_name: string; course_code: string }>(
      coursesData.map((c: any) => [c.id, c])
    );

    console.log('[LeaveOndutyService.getPeriodsForDate] Enrichment data:', {
      periodsFound: periodsData?.length || 0,
      coursesFound: coursesData.length,
      periodMapKeys: Array.from(periodMap.keys()),
      courseMapKeys: Array.from(courseMap.keys()),
    });

    // Enrich dayPeriods with period and course details
    const enrichedPeriods: Record<string, any> = {};
    for (const periodId of allPeriodIds) {
      const slot = dayPeriods[periodId];
      const periodInfo = periodMap.get(periodId);
      const courseInfo = slot?.course_id ? courseMap.get(slot.course_id) : null;

      enrichedPeriods[periodId] = {
        ...slot,
        // Add period details
        period_id: periodId,
        period_name: periodInfo?.period_name || 'Period',
        start_time: periodInfo?.start_time || '',
        end_time: periodInfo?.end_time || '',
        is_break: periodInfo?.is_break || false,
        // Add course details
        course_name: courseInfo?.course_name || '',
        course_code: courseInfo?.course_code || '',
      };
    }

    console.log('[LeaveOndutyService.getPeriodsForDate] Enriched periods:', {
      sampleEnriched: allPeriodIds.length > 0 ? enrichedPeriods[allPeriodIds[0]] : null,
    });

    let selectedPeriods: string[] = [];

    switch (periodType) {
      case 'fullday':
        selectedPeriods = allPeriodIds;
        break;

      case 'forenoon':
        selectedPeriods = allPeriodIds.filter((periodId) => {
          const period = enrichedPeriods[periodId];
          if (!period?.start_time) return false;
          const startTime = this.parseTime(period.start_time);
          const forenoonStart = this.parseTime(
            DEFAULT_VALIDATION_RULES.periods.forenoonStart
          );
          const forenoonEnd = this.parseTime(
            DEFAULT_VALIDATION_RULES.periods.forenoonEnd
          );
          return startTime >= forenoonStart && startTime <= forenoonEnd;
        });
        break;

      case 'afternoon':
        selectedPeriods = allPeriodIds.filter((periodId) => {
          const period = enrichedPeriods[periodId];
          if (!period?.start_time) return false;
          const startTime = this.parseTime(period.start_time);
          const afternoonStart = this.parseTime(
            DEFAULT_VALIDATION_RULES.periods.afternoonStart
          );
          const afternoonEnd = this.parseTime(
            DEFAULT_VALIDATION_RULES.periods.afternoonEnd
          );
          return startTime >= afternoonStart && startTime <= afternoonEnd;
        });
        break;

      case 'periodwise':
        // For periodwise, return all periods for manual selection
        selectedPeriods = allPeriodIds;
        break;

      default:
        return {
          valid: false,
          periods: [],
          error: 'Invalid period type',
        };
    }

    return {
      valid: true,
      periods: selectedPeriods,
      timetable: enrichedPeriods,
    };
  }

  /**
   * Helper to parse time string to minutes since midnight
   */
  private static parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Validate that timetable exists for a date
   */
  private static async validateTimetableExists(
    sectionId: string,
    semesterId: string,
    date: string
  ): Promise<ValidationResult> {
    const supabase = getSupabase();

    // Try section-specific timetable first, fall back to semester-only
    const { data: sectionTt, error: sectionErr } = await supabase
      .from('timetables')
      .select('id, timetable_data')
      .eq('section_id', sectionId)
      .eq('semester_id', semesterId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let timetable = sectionTt;

    if (!timetable) {
      const { data: semesterTt, error: semesterErr } = await supabase
        .from('timetables')
        .select('id, timetable_data')
        .is('section_id', null)
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      timetable = semesterTt;

      if (sectionErr || semesterErr) {
        return {
          valid: false,
          error: 'Failed to verify timetable. Please try again.',
        };
      }
    }

    if (!timetable) {
      return {
        valid: false,
        error: 'No active timetable found for your section. Please contact administrator.',
      };
    }

    const timetableData = timetable.timetable_data || {};
    if (Object.keys(timetableData).length === 0) {
      return {
        valid: false,
        error: 'No classes scheduled in the timetable. Please contact administrator.',
      };
    }

    return { valid: true };
  }

  /**
   * Upload attachment to storage
   */
  private static async uploadAttachment(
    file: File,
    institutionId: string,
    learnerId: string
  ): Promise<string> {
    const supabase = getSupabase();

    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.name}`;
    const filePath = `${institutionId}/${learnerId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('leave-onduty-attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload attachment: ${error.message}`);
    }

    // Get public URL (signed URL for private bucket)
    const { data: urlData } = supabase.storage
      .from('leave-onduty-attachments')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }

  /**
   * Get all applications with admin filters
   */
  static async getAllApplications(
    filters: ApplicationFilters
  ): Promise<LeaveOndutyApplication[]> {
    const supabase = getSupabase();

    let query: any = supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        learner:learners_profiles(
          id,
          first_name,
          last_name,
          roll_number,
          register_number,
          student_email
        ),
        institution:institutions(id, name),
        department:departments(id, department_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        approvals:leave_onduty_approvals(
          *,
          approver:profiles(id, full_name, email, avatar_url)
        )
      `
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }
    if (filters.section_id) {
      query = query.eq('section_id', filters.section_id);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.sub_category) {
      query = query.eq('sub_category', filters.sub_category);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.start_date) {
      query = query.gte('start_date', filters.start_date);
    }
    if (filters.end_date) {
      query = query.lte('end_date', filters.end_date);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    return (data as LeaveOndutyApplication[]) || [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTENDANCE CHECK (from leave-onduty-attendance-check-service.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get approved leave/onduty applications for students in a section on a specific date
   */
  static async getApprovedLeaveForAttendance(
    sectionId: string,
    date: string,
    periods?: string[]
  ): Promise<ApprovedLeaveInfo[]> {
    const supabase = createClientSupabaseClient();

    try {
      // Validate parameters
      if (!sectionId || !date) {
        console.warn('[leave-check] Missing required parameters:', { sectionId, date });
        return [];
      }

      // Log the parameters being sent
      console.log('[leave-check] Calling RPC with params:', {
        p_section_id: sectionId,
        p_date: date,
        p_periods: periods || null
      });

      // Call the database function
      const { data, error } = await supabase.rpc(
        'get_approved_leave_for_attendance',
        {
          p_section_id: sectionId,
          p_date: date,
          p_periods: periods || null
        }
      );

      if (error) {
        console.error('[leave-check] Error fetching approved leave:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      // Transform and add computed fields
      return (data || []).map((item: any) => ({
        ...item,
        attendance_status: item.category === 'leave' ? 'absent' : 'onduty'
      }));
    } catch (error: any) {
      console.error('[leave-check] Failed to get approved leave:', {
        name: error?.name,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        sectionId,
        date,
        periods
      });
      return [];
    }
  }

  /**
   * Get pre-fill data for attendance marking
   * Returns suggested status for each student based on approved applications
   */
  static async getAttendancePreFillData(
    sectionId: string,
    date: string,
    studentIds: string[],
    periods?: string[]
  ): Promise<Map<string, AttendancePreFillData>> {
    const approvedLeave = await this.getApprovedLeaveForAttendance(
      sectionId,
      date,
      periods
    );

    // Create a map of student_id -> pre-fill data
    const preFillMap = new Map<string, AttendancePreFillData>();

    // Initialize all students with default "Present" status
    for (const studentId of studentIds) {
      preFillMap.set(studentId, {
        student_id: studentId,
        suggested_status: 'Present',
        has_approved_leave: false,
        can_override: true
      });
    }

    // Update students who have approved leave
    for (const leave of approvedLeave) {
      const existingData = preFillMap.get(leave.learner_id);
      if (existingData) {
        preFillMap.set(leave.learner_id, {
          student_id: leave.learner_id,
          suggested_status:
            leave.category === 'leave' ? 'Absent' : 'OnDuty',
          has_approved_leave: true,
          leave_info: leave,
          can_override: false // Don't allow overriding approved leave (can be changed based on requirements)
        });
      }
    }

    return preFillMap;
  }

  /**
   * Check if a specific student has approved leave for a date/period
   */
  static async hasApprovedLeave(
    studentId: string,
    sectionId: string,
    date: string,
    periods?: string[]
  ): Promise<boolean> {
    const approvedLeave = await this.getApprovedLeaveForAttendance(
      sectionId,
      date,
      periods
    );

    return approvedLeave.some((leave) => leave.learner_id === studentId);
  }

  /**
   * Get leave summary for display in UI
   */
  static getLeaveDisplayInfo(leaveInfo: ApprovedLeaveInfo): {
    badge_text: string;
    badge_color: string;
    tooltip: string;
    icon: string;
  } {
    const isLeave = leaveInfo.category === 'leave';

    return {
      badge_text: isLeave ? 'Leave' : 'On Duty',
      badge_color: isLeave
        ? 'bg-orange-100 text-orange-800 border-orange-200'
        : 'bg-blue-100 text-blue-800 border-blue-200',
      tooltip: `${isLeave ? 'Leave' : 'On Duty'}: ${leaveInfo.subcategory}\n${leaveInfo.reason}`,
      icon: isLeave ? '🏖️' : '💼'
    };
  }

  /**
   * Check if attendance can be marked for a student (considering approved leave)
   * This can be used to show warnings or block certain actions
   */
  static canMarkAttendanceForStudent(
    preFillData: AttendancePreFillData,
    newStatus: 'Present' | 'Absent' | 'OnDuty'
  ): {
    allowed: boolean;
    warning?: string;
  } {
    // If student has approved leave, check if teacher is trying to override
    if (preFillData.has_approved_leave) {
      const suggestedStatus = preFillData.suggested_status;

      if (newStatus !== suggestedStatus) {
        return {
          allowed: preFillData.can_override,
          warning: `Student has approved ${preFillData.leave_info?.category}. Are you sure you want to mark them as ${newStatus}?`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get statistics about approved leave for reporting
   */
  static getLeaveStatistics(approvedLeave: ApprovedLeaveInfo[]): {
    total: number;
    leave_count: number;
    onduty_count: number;
    by_subcategory: Record<string, number>;
  } {
    const stats = {
      total: approvedLeave.length,
      leave_count: 0,
      onduty_count: 0,
      by_subcategory: {} as Record<string, number>
    };

    for (const leave of approvedLeave) {
      if (leave.category === 'leave') {
        stats.leave_count++;
      } else {
        stats.onduty_count++;
      }

      // Count by subcategory
      const key = leave.subcategory;
      stats.by_subcategory[key] = (stats.by_subcategory[key] || 0) + 1;
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTENDANCE INTEGRATION (from leave-onduty-attendance-integration-service.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Main function to update attendance when application is approved
   */
  static async updateAttendanceOnApproval(
    applicationId: string
  ): Promise<void> {
    const supabase = getSupabase();

    // Get application details
    const { data: application, error: appError } = await supabase
      .from('leave_onduty_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      throw new Error('Application not found');
    }

    // Get affected date range
    const dateRange = this.getDateRange(
      application.start_date,
      application.end_date
    );

    // Get periods to update
    const periods = application.selected_periods || [];

    if (periods.length === 0) {
      console.warn('No periods selected for application:', applicationId);
      return;
    }

    // Determine new status based on category
    const newStatus = application.category === 'leave' ? 'absent' : 'onduty';

    // Process each date
    for (const date of dateRange) {
      await this.updateAttendanceForDate(
        application,
        date,
        periods,
        newStatus
      );
    }
  }

  /**
   * Update attendance for a specific date
   */
  private static async updateAttendanceForDate(
    application: LeaveOndutyApplication,
    date: string,
    periods: string[],
    newStatus: string
  ): Promise<void> {
    const supabase = getSupabase();

    console.log('[attendance-integration] Updating attendance for date:', {
      date,
      section_id: application.section_id,
      learner_id: application.learner_id,
      periods,
      newStatus
    });

    // Get timetable to map period IDs to slot IDs
    // Try section-specific first, then fall back to semester-only (section_id is null on many timetables)
    console.log('[attendance-integration] Fetching timetable for section:', application.section_id);

    let timetable: any = null;

    // Try section-specific match
    const { data: sectionTt } = await supabase
      .from('timetables')
      .select('timetable_data')
      .eq('section_id', application.section_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sectionTt) {
      timetable = sectionTt;
    } else {
      // Fallback: find timetable by semester via the section's semester_id
      const { data: section } = await supabase
        .from('sections')
        .select('semester_id')
        .eq('id', application.section_id)
        .single();

      if (section?.semester_id) {
        const { data: semesterTt } = await supabase
          .from('timetables')
          .select('timetable_data')
          .is('section_id', null)
          .eq('semester_id', section.semester_id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        timetable = semesterTt;
      }
    }

    console.log('[attendance-integration] Timetable result:', {
      found: !!timetable,
      has_data: !!timetable?.timetable_data
    });

    if (!timetable?.timetable_data) {
      console.warn('[attendance-integration] No active timetable found for section');
      return;
    }

    // Map period IDs to slot IDs
    const periodToSlotMap = new Map<string, string>();
    const timetableData = timetable.timetable_data;

    for (const day in timetableData) {
      for (const periodId in timetableData[day]) {
        const slot = timetableData[day][periodId];
        if (slot.slot_id) {
          periodToSlotMap.set(periodId, slot.slot_id);
        }
      }
    }

    console.log('[attendance-integration] Period to slot mapping:', Array.from(periodToSlotMap.entries()));

    // Convert period IDs to slot IDs
    const slotIds = periods
      .map(periodId => periodToSlotMap.get(periodId))
      .filter(Boolean) as string[];

    console.log('[attendance-integration] Converted periods to slots:', {
      original_periods: periods,
      mapped_slots: slotIds
    });

    if (slotIds.length === 0) {
      console.warn('[attendance-integration] No slot IDs found for selected periods');
      return;
    }

    // Find attendance record for this date and section
    const { data: attendanceRecord, error: findError } = await supabase
      .from('student_attendance')
      .select('*')
      .eq('section_id', application.section_id)
      .eq('attendance_date', date)
      .maybeSingle();

    if (findError) {
      console.error('[attendance-integration] Error finding attendance record:', findError);
      return;
    }

    if (!attendanceRecord) {
      console.warn('[attendance-integration] No attendance record found for date:', date);
      return;
    }

    console.log('[attendance-integration] Found attendance record:', {
      record_id: attendanceRecord.id,
      available_periods: Object.keys(attendanceRecord.attendance_data || {})
    });

    // Get current attendance data (JSONB)
    const attendanceData = { ...attendanceRecord.attendance_data };
    let updated = false;

    // Update each slot (now using mapped slot IDs instead of period IDs)
    for (const slotId of slotIds) {
      console.log('[attendance-integration] Checking slot:', slotId, 'exists:', !!attendanceData[slotId]);

      if (attendanceData[slotId]?.students) {
        const students = attendanceData[slotId].students;
        console.log('[attendance-integration] Slot has', students.length, 'students');

        const studentIndex = students.findIndex(
          (s: any) => s.student_id === application.learner_id
        );

        console.log('[attendance-integration] Student found at index:', studentIndex);

        if (studentIndex !== -1) {
          const oldStatus = students[studentIndex].status;

          console.log('[attendance-integration] Student current status:', {
            old_status: oldStatus,
            new_status: newStatus,
            needs_update: oldStatus !== newStatus
          });

          // Only update if status is different
          if (oldStatus !== newStatus) {
            students[studentIndex].status = newStatus;
            students[studentIndex].marked_at = new Date().toISOString();

            console.log('[attendance-integration] Status updated, creating audit record');

            // Create audit record
            await this.createAttendanceUpdateAudit({
              application_id: application.id,
              attendance_record_id: attendanceRecord.id,
              period_slot_id: slotId,
              student_id: application.learner_id,
              old_status: oldStatus,
              new_status: newStatus,
              updated_by: null, // System update
            });

            updated = true;
          }
        } else {
          console.warn('[attendance-integration] Student not found in slot students list');
        }
      } else {
        console.warn('[attendance-integration] Slot not found in attendance data');
      }
    }

    // Save updated attendance if changes were made
    if (updated) {
      console.log('[attendance-integration] Saving updated attendance record');

      const { error: updateError } = await supabase
        .from('student_attendance')
        .update({
          attendance_data: attendanceData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', attendanceRecord.id);

      if (updateError) {
        console.error('[attendance-integration] Error updating attendance:', updateError);
        throw new Error(`Failed to update attendance: ${updateError.message}`);
      }

      console.log('[attendance-integration] Attendance record saved successfully');
    } else {
      console.warn('[attendance-integration] No updates were made for this date');
    }
  }

  /**
   * Get date range between start and end dates (inclusive)
   */
  private static getDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    return dates;
  }

  /**
   * Create audit trail record for attendance update
   */
  private static async createAttendanceUpdateAudit(
    data: Omit<AttendanceUpdateRecord, 'id' | 'updated_at'>
  ): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_attendance_updates')
      .insert(data);

    if (error) {
      console.error('Error creating audit record:', error);
      // Don't throw - audit failure shouldn't break the main flow
    }
  }

  /**
   * Get affected attendance records for an application
   */
  static async getAffectedAttendanceRecords(
    applicationId: string
  ): Promise<any[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('leave_onduty_attendance_updates')
      .select(
        `
        *,
        application:leave_onduty_applications(
          *,
          learner:learners_profiles(first_name, last_name, student_roll_no)
        )
      `
      )
      .eq('application_id', applicationId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch attendance updates: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Revert attendance changes (in case application is cancelled/rejected after approval)
   */
  static async revertAttendanceChanges(
    applicationId: string
  ): Promise<void> {
    const supabase = getSupabase();

    // Get all attendance update records
    const { data: updates, error: fetchError } = await supabase
      .from('leave_onduty_attendance_updates')
      .select('*')
      .eq('application_id', applicationId);

    if (fetchError || !updates) {
      throw new Error('Failed to fetch attendance updates for rollback');
    }

    // Group updates by attendance record
    const recordMap = new Map<string, any[]>();
    for (const update of updates) {
      if (!recordMap.has(update.attendance_record_id)) {
        recordMap.set(update.attendance_record_id, []);
      }
      recordMap.get(update.attendance_record_id)!.push(update);
    }

    // Revert each attendance record
    for (const [recordId, recordUpdates] of recordMap.entries()) {
      const { data: attendanceRecord } = await supabase
        .from('student_attendance')
        .select('*')
        .eq('id', recordId)
        .single();

      if (!attendanceRecord) continue;

      const attendanceData = { ...attendanceRecord.attendance_data };

      // Revert each period
      for (const update of recordUpdates) {
        if (attendanceData[update.period_slot_id]?.students) {
          const students = attendanceData[update.period_slot_id].students;
          const studentIndex = students.findIndex(
            (s: any) => s.student_id === update.student_id
          );

          if (studentIndex !== -1) {
            // Revert to old status
            students[studentIndex].status = update.old_status;
            students[studentIndex].marked_at = new Date().toISOString();
          }
        }
      }

      // Save reverted attendance
      await supabase
        .from('student_attendance')
        .update({
          attendance_data: attendanceData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordId);
    }

    // Delete audit records (since changes are reverted)
    await supabase
      .from('leave_onduty_attendance_updates')
      .delete()
      .eq('application_id', applicationId);
  }

  /**
   * Get attendance impact summary for an application
   */
  static async getAttendanceImpactSummary(
    applicationId: string
  ): Promise<{
    total_updates: number;
    periods_affected: number;
    dates_affected: number;
    status_breakdown: { absent: number; onduty: number };
  }> {
    const supabase = getSupabase();

    const { data: updates } = await supabase
      .from('leave_onduty_attendance_updates')
      .select('*')
      .eq('application_id', applicationId);

    if (!updates || updates.length === 0) {
      return {
        total_updates: 0,
        periods_affected: 0,
        dates_affected: 0,
        status_breakdown: { absent: 0, onduty: 0 },
      };
    }

    const uniquePeriods = new Set(updates.map((u) => u.period_slot_id));
    const uniqueDates = new Set(
      updates.map((u) => new Date(u.updated_at).toISOString().split('T')[0])
    );

    const statusBreakdown = {
      absent: updates.filter((u) => u.new_status === 'absent').length,
      onduty: updates.filter((u) => u.new_status === 'onduty').length,
    };

    return {
      total_updates: updates.length,
      periods_affected: uniquePeriods.size,
      dates_affected: uniqueDates.size,
      status_breakdown: statusBreakdown,
    };
  }

  /**
   * Validate attendance records exist before applying leave/onduty
   */
  static async validateAttendanceRecordsExist(
    sectionId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    valid: boolean;
    missing_dates: string[];
    message?: string;
  }> {
    const supabase = getSupabase();

    const dateRange = this.getDateRange(startDate, endDate);
    const missingDates: string[] = [];

    for (const date of dateRange) {
      const { data } = await supabase
        .from('student_attendance')
        .select('id')
        .eq('section_id', sectionId)
        .eq('attendance_date', date)
        .maybeSingle();

      if (!data) {
        missingDates.push(date);
      }
    }

    if (missingDates.length > 0) {
      return {
        valid: false,
        missing_dates: missingDates,
        message: `Attendance not yet marked for: ${missingDates.join(', ')}. Updates will be applied when attendance is marked.`,
      };
    }

    return {
      valid: true,
      missing_dates: [],
    };
  }
}
