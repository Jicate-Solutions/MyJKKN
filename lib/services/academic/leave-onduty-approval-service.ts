/**
 * Leave/OnDuty Approval Service
 *
 * Handles approval workflow logic including:
 * - Processing approvals and rejections
 * - Checking approval permissions
 * - Getting approval timelines
 * - Notifying approvers
 * - Managing workflow progression
 *
 * @module services/academic/leave-onduty-approval-service
 * @created 2026-01-28
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  LeaveOndutyApproval,
  ApprovalActionData,
  ApprovalTimelineStep,
  LeaveOndutyApplication,
} from '@/types/leave-onduty';
import { LeaveOndutyAttendanceIntegrationService } from './leave-onduty-attendance-integration-service';
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';

// Helper to get untyped client for tables not yet in database.types.ts
const getSupabase = () => createClientSupabaseClient() as any;

/**
 * What fn_leave_onduty_decide_step reports back: the STORED state (read back
 * with RETURNING) after the approver's decision was written, in the same
 * transaction.
 */
export interface LeaveOndutyStepDecision {
  application_id: string;
  decision: 'approved' | 'rejected';
  decided_step: number;
  /** The approver's step row as stored. */
  step_status: 'approved' | 'rejected';
  /** The application as stored: 'pending' means it moved on to the next step. */
  status: 'pending' | 'approved' | 'rejected';
  current_step: number | null;
}

export class LeaveOndutyApprovalService {
  /**
   * Process an approval or rejection
   */
  static async processApproval(
    data: ApprovalActionData
  ): Promise<void> {
    const supabase = getSupabase();

    console.log('[leave-onduty/approval] Processing approval:', {
      application_id: data.application_id,
      approver_id: data.approver_id,
      status: data.status,
    });

    // Get approver profile to check if super admin
    const { data: approverProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.approver_id)
      .single();

    const isSuperAdmin = approverProfile?.role === 'super_admin';
    console.log('[leave-onduty/approval] Approver role:', { isSuperAdmin, role: approverProfile?.role });

    // Get application details
    const { data: application, error: appError } = await supabase
      .from('leave_onduty_applications')
      .select('*, approvals:leave_onduty_approvals(*)')
      .eq('id', data.application_id)
      .single();

    if (appError || !application) {
      throw new Error('Application not found');
    }

    // Check if application is still pending
    if (application.status !== 'pending') {
      throw new Error('Application is not pending approval');
    }

    // Super admin direct approval (no flow or override)
    if (isSuperAdmin) {
      console.log('[leave-onduty/approval] Super admin approval - creating audit record');

      // Create approval record for audit trail
      const { error: insertError } = await supabase.from('leave_onduty_approvals').insert({
        application_id: data.application_id,
        step_order: 1,
        approver_id: data.approver_id,
        approver_role: 'super_admin',
        status: data.status,
        comments: data.comments,
        action_taken_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error('[leave-onduty/approval] Failed to create approval record:', insertError);
        throw new Error(`Failed to create approval record: ${insertError.message}`);
      }

      console.log('[leave-onduty/approval] Audit record created, processing action:', data.status);

      if (data.status === 'rejected') {
        console.log('[leave-onduty/approval] Calling handleRejection');
        await this.handleRejection(application.id, data.application_id);
      } else {
        console.log('[leave-onduty/approval] Calling finalizeApproval for application:', application.id);
        await this.finalizeApproval(application.id);
      }

      console.log('[leave-onduty/approval] Super admin approval completed successfully');

      (async () => {
        try {
          const { data: learnerApp } = await getSupabase()
            .from('leave_onduty_applications')
            .select('learner_id, institution_id')
            .eq('id', data.application_id)
            .single();
          const applicantId = learnerApp?.learner_id || data.application_id;
          const template = data.status === 'rejected'
            ? AcademicActivityTemplates.leaveOndutyApplicationRejected(applicantId)
            : AcademicActivityTemplates.leaveOndutyApplicationApproved(applicantId);
          await logActivityClient({
            userId: data.approver_id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: data.application_id,
            description: template.description,
            metadata: { sub_type: template.sub_type, action: data.status, comments: data.comments },
            institutionId: learnerApp?.institution_id,
          });
        } catch { /* never block */ }
      })();

      return;
    }

    // Approver path (faculty / HOD / principal / anyone holding a seeded step).
    //
    // 2026-09-24: this used to write leave_onduty_applications.current_step and
    // .status from the browser under the approver's login. That table's UPDATE
    // policies admit only super_admin / admin / institution_admin, the learner
    // and the sponsor, so for every other approver those writes matched 0 rows
    // WITHOUT an error: the step flipped to 'approved', the screen said
    // "approved successfully", and the chain never advanced (on production 3 of
    // 150 applications were ever approved, all by a super admin). The whole
    // decision now happens in one server-side transaction that checks the
    // caller holds the current pending step.
    const decision = await this.decideOwnStep(data);

    // Handle rejection - immediately reject application
    if (data.status === 'rejected') {
      (async () => {
        try {
          const template = AcademicActivityTemplates.leaveOndutyApplicationRejected(
            application.learner_id || data.application_id
          );
          await logActivityClient({
            userId: data.approver_id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: data.application_id,
            description: template.description,
            metadata: { sub_type: template.sub_type, action: 'rejected', comments: data.comments },
            institutionId: application.institution_id,
          });
        } catch { /* never block */ }
      })();
      return;
    }

    // Attendance is credited only when the application itself has really
    // become 'approved' — never for an intermediate step.
    if (decision.status === 'approved') {
      await this.applyApprovedAttendance(data.application_id);
    }

    (async () => {
      try {
        const template = AcademicActivityTemplates.leaveOndutyApplicationApproved(
          application.learner_id || data.application_id
        );
        await logActivityClient({
          userId: data.approver_id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: data.application_id,
          description: template.description,
          metadata: { sub_type: template.sub_type, action: 'approved', comments: data.comments },
          institutionId: application.institution_id,
        });
      } catch { /* never block */ }
    })();
  }

  /**
   * An approver decides their own pending step, server-side, in one
   * transaction (fn_leave_onduty_decide_step). Throws unless the returned state
   * proves the decision really landed — a silent no-op must never read as
   * success.
   */
  private static async decideOwnStep(
    data: ApprovalActionData
  ): Promise<LeaveOndutyStepDecision> {
    const supabase = getSupabase();

    const { data: result, error } = await supabase.rpc('fn_leave_onduty_decide_step', {
      p_application_id: data.application_id,
      p_decision: data.status,
      p_comments: data.comments ?? null,
    });

    if (error) {
      throw new Error(error.message || 'Your decision could not be saved');
    }

    const decision = result as LeaveOndutyStepDecision | null;
    const landed =
      !!decision &&
      decision.application_id === data.application_id &&
      decision.step_status === data.status &&
      (data.status === 'rejected'
        ? decision.status === 'rejected'
        : decision.status === 'approved' || decision.status === 'pending');

    if (!landed) {
      console.error('[leave-onduty/approval] Decision did not change the application:', result);
      throw new Error(
        'Your decision was not saved — the application did not change. Please refresh and try again.'
      );
    }

    return decision as LeaveOndutyStepDecision;
  }

  /**
   * Handle rejection - update application status
   * (super admin override only; approvers go through decideOwnStep)
   */
  private static async handleRejection(
    approvalId: string,
    applicationId: string
  ): Promise<void> {
    const supabase = getSupabase();

    console.log('[leave-onduty/approval] Handling rejection for application:', applicationId);

    const { data: landed, error: updateError } = await supabase
      .from('leave_onduty_applications')
      .update({ status: 'rejected' })
      .eq('id', applicationId)
      .select('id, status');

    if (updateError) {
      console.error('[leave-onduty/approval] Failed to update application status to rejected:', updateError);
      throw new Error(`Failed to reject application: ${updateError.message}`);
    }

    // RLS answers a refused UPDATE with 0 rows and no error.
    if (!Array.isArray(landed) || landed.length === 0 || landed[0]?.status !== 'rejected') {
      throw new Error('The rejection was not saved — the application did not change.');
    }

    console.log('[leave-onduty/approval] Application status updated to rejected');

    // TODO: Notify learner of rejection
  }

  /**
   * Finalize approval and trigger attendance update
   * (super admin override only; approvers go through decideOwnStep)
   */
  private static async finalizeApproval(applicationId: string): Promise<void> {
    const supabase = getSupabase();

    console.log('[leave-onduty/approval] Finalizing approval for application:', applicationId);

    // Update application status
    const { data: landed, error: updateError } = await supabase
      .from('leave_onduty_applications')
      .update({ status: 'approved' })
      .eq('id', applicationId)
      .select('id, status');

    if (updateError) {
      console.error('[leave-onduty/approval] Failed to update application status:', updateError);
      throw new Error(`Failed to update application status: ${updateError.message}`);
    }

    // RLS answers a refused UPDATE with 0 rows and no error. Attendance must
    // never be written for an application that did not become 'approved'.
    if (!Array.isArray(landed) || landed.length === 0 || landed[0]?.status !== 'approved') {
      throw new Error('The approval was not saved — the application did not change.');
    }

    console.log('[leave-onduty/approval] Application status updated to approved');

    await this.applyApprovedAttendance(applicationId);
  }

  /**
   * Credit attendance for an application whose 'approved' status has landed.
   */
  private static async applyApprovedAttendance(applicationId: string): Promise<void> {
    // Trigger attendance integration
    try {
      console.log('[leave-onduty/approval] Triggering attendance integration');
      await LeaveOndutyAttendanceIntegrationService.updateAttendanceOnApproval(
        applicationId
      );
      console.log('[leave-onduty/approval] Attendance integration completed');
    } catch (error) {
      console.error('[leave-onduty/approval] Attendance integration failed:', error);
      // Don't throw - approval is still successful even if attendance integration fails
    }

    // TODO: Notify learner of approval
  }

  /**
   * Get approval timeline for an application
   */
  static async getApprovalTimeline(
    applicationId: string
  ): Promise<ApprovalTimelineStep[]> {
    const supabase = getSupabase();

    // Get application with approvals
    const query: any = supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        approvals:leave_onduty_approvals(
          *,
          approver:profiles!leave_onduty_approvals_approver_id_fkey(id, full_name, email)
        )
      `
      );

    const { data: application, error } = await query
      .eq('id', applicationId)
      .single();

    if (error || !application) {
      throw new Error('Application not found');
    }

    // Get flow configuration
    const { data: flow } = await supabase.rpc('get_applicable_approval_flow', {
      p_institution_id: application.institution_id,
      p_department_id: application.department_id,
      p_semester_id: application.semester_id,
      p_category: application.category,
      p_sub_category: application.sub_category,
    });

    // The SEEDED APPROVAL ROWS drive this timeline, not the flow.
    //
    // 2026-08-07: a learner viewing their own (correctly seeded) application saw
    // "No approval workflow configured". The timeline was built by mapping over
    // flow.flow_steps, and get_applicable_approval_flow is SECURITY INVOKER —
    // leave_onduty_approval_flows' only SELECT policy admits staff roles, never
    // 'student'. So for the applicant the flow always came back as an all-NULL
    // row (note: PostgREST yields an OBJECT with null fields for a composite
    // return, so the `if (!flow) return []` guard below never fired — flow was
    // truthy and flow_steps was null), the step list was empty, and the whole
    // chain vanished from the UI even though both approver rows existed and
    // were readable.
    //
    // leave_onduty_approvals IS visible to the applicant, and it is also the
    // better source: those rows are what actually gates the application, they
    // record who it really went to, and they survive a later edit to the flow.
    // The flow is consulted only to enrich (is_required), never to decide
    // whether there is a timeline at all.
    const flowSteps: any[] = (flow as any)?.flow_steps || [];
    const approvals: any[] = application.approvals || [];

    const stepOrders: number[] =
      approvals.length > 0
        ? Array.from(new Set(approvals.map((a: any) => Number(a.step_order))))
        : flowSteps.map((s: any) => Number(s.step_order));
    stepOrders.sort((a, b) => a - b);

    // Build timeline
    const timeline: ApprovalTimelineStep[] = stepOrders.map((order) => {
      const approval = approvals.find((a: any) => Number(a.step_order) === order);
      const step = flowSteps.find((s: any) => Number(s.step_order) === order);

      return {
        step_order: order,
        // The flow step's role lives in `approver_role`; `step.role` never
        // existed, so the heading (APPROVER_ROLE_LABELS[step.role]) rendered
        // blank for everyone, staff included. Prefer the approval row — it is
        // the role the request was actually routed under.
        role: approval?.approver_role ?? step?.approver_role ?? step?.role,
        // No flow step has ever carried `description` either. Empty string
        // rather than `undefined` so the type is honest about it.
        description: step?.description ?? '',
        approver_name: approval?.approver?.full_name || null,
        approver_email: approval?.approver?.email || null,
        status: approval?.status || 'pending',
        comments: approval?.comments || null,
        action_taken_at: approval?.action_taken_at || null,
        is_current: application.current_step === order,
        // Steps are required unless the flow says otherwise; when the flow is
        // invisible (the applicant's own view) assume required rather than
        // silently downgrading a mandatory approval to optional.
        is_required: step?.is_required ?? true,
      };
    });

    return timeline;
  }

  /**
   * Check if user has permission to approve application
   */
  static async checkApprovalPermission(
    approverId: string,
    applicationId: string
  ): Promise<boolean> {
    const supabase = getSupabase();

    const { data } = await supabase.rpc('is_valid_approver', {
      p_user_id: approverId,
      p_application_id: applicationId,
    });

    return !!data;
  }

  /**
   * Get pending approvals for an approver
   */
  static async getPendingApprovals(
    approverId: string
  ): Promise<LeaveOndutyApproval[]> {
    const supabase = getSupabase();

    const query: any = supabase
      .from('leave_onduty_approvals')
      .select(
        `
        *,
        application:leave_onduty_applications!application_id(
          *,
          learner:learners_profiles!learner_id(
            id,
            first_name,
            last_name,
            roll_number,
            register_number,
            student_email
          ),
          section:sections!section_id(
            id,
            section_name,
            degree:degrees!degree_id(id, degree_name, degree_id)
          ),
          department:departments!department_id(id, department_name, department_code),
          semester:semesters!semester_id(id, semester_name),
          institution:institutions!institution_id(id, name)
        )
      `
      );

    const { data, error } = await query
      .eq('approver_id', approverId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch pending approvals: ${error.message}`);
    }

    return (data as LeaveOndutyApproval[]) || [];
  }

  /**
   * Get ALL applications for super admin by status (across all institutions)
   * @param status - Filter by status: 'pending', 'approved', 'rejected', or 'all'
   */
  static async getAllApplicationsForSuperAdminByStatus(status: string = 'pending'): Promise<any[]> {
    const supabase = getSupabase();

    console.log('[leave-onduty/approvals] Super Admin: Fetching applications with status:', status);

    let query = supabase
      .from('leave_onduty_applications')
      .select(`
        *,
        learner:learner_id(
          id,
          first_name,
          last_name,
          roll_number,
          register_number,
          student_email
        ),
        section:sections!section_id(
          id,
          section_name,
          degree:degrees!degree_id(id, degree_name, degree_id)
        ),
        department:departments!department_id(id, department_name, department_code),
        semester:semesters!semester_id(id, semester_name),
        institution:institutions!institution_id(id, name),
        approvals:leave_onduty_approvals!application_id(*)
      `);

    // Filter by status if not 'all'
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[leave-onduty/approvals] Super Admin: Query error:', error);
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    console.log('[leave-onduty/approvals] Super Admin: Success. Found', data?.length, 'applications');
    return data || [];
  }

  /**
   * Get ALL pending applications for super admin (across all institutions)
   * Returns applications with status 'pending', regardless of approval flow
   * @deprecated Use getAllApplicationsForSuperAdminByStatus instead
   */
  static async getAllPendingApplicationsForSuperAdmin(): Promise<any[]> {
    return this.getAllApplicationsForSuperAdminByStatus('pending');
  }

  /**
   * Get applications by status filtered by institution and department
   * Used for HOD, Principal, and other institutional roles
   * @param status - Filter by status: 'pending', 'approved', 'rejected', or 'all'
   * @param institutionId - Filter by institution
   * @param departmentId - Optional: Filter by department (for HOD)
   */
  static async getApplicationsByStatusForInstitution(
    status: string = 'pending',
    institutionId: string,
    departmentId?: string
  ): Promise<any[]> {
    const supabase = getSupabase();

    console.log('[leave-onduty/approvals] Institution: Fetching applications', {
      status,
      institutionId,
      departmentId,
    });

    let query = supabase
      .from('leave_onduty_applications')
      .select(`
        *,
        learner:learners_profiles!learner_id(
          id,
          first_name,
          last_name,
          roll_number,
          register_number,
          student_email
        ),
        section:sections!section_id(
          id,
          section_name,
          degree:degrees!degree_id(id, degree_name, degree_id)
        ),
        department:departments!department_id(id, department_name, department_code),
        semester:semesters!semester_id(id, semester_name),
        institution:institutions!institution_id(id, name),
        approvals:leave_onduty_approvals!application_id(*)
      `)
      .eq('institution_id', institutionId);

    // Filter by department if provided (for HOD)
    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    // Filter by status if not 'all'
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[leave-onduty/approvals] Institution: Query error:', error);
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    console.log('[leave-onduty/approvals] Institution: Success. Found', data?.length, 'applications');
    return data || [];
  }

  /**
   * LEGACY METHOD - kept for backward compatibility
   * Get ALL pending applications for super admin (across all institutions)
   */
  private static async _getAllPendingApplicationsForSuperAdmin_LEGACY(): Promise<any[]> {
    const supabase = getSupabase();

    console.log('[leave-onduty/approvals] Super Admin: Fetching pending applications...');

    // Query with nested degree relationship
    const { data, error } = await supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        learner:learners_profiles!learner_id(
          id,
          first_name,
          last_name,
          roll_number,
          register_number,
          student_email
        ),
        section:sections!section_id(
          id,
          section_name,
          degree:degrees!degree_id(id, degree_name, degree_id)
        ),
        department:departments!department_id(id, department_name, department_code),
        semester:semesters!semester_id(id, semester_name),
        institution:institutions!institution_id(id, name),
        approvals:leave_onduty_approvals!application_id(*)
      `
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[leave-onduty/approvals] Super Admin: Query error:', error);
      console.error('[leave-onduty/approvals] Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error(`Failed to fetch pending applications: ${error.message}`);
    }

    console.log('[leave-onduty/approvals] Super Admin: Success. Found', data?.length, 'applications');
    return data || [];
  }

  /**
   * Get approval statistics for super admin (all institutions)
   */
  static async getSuperAdminApprovalStatistics(): Promise<{
    pending: number;
    approved_today: number;
    rejected_today: number;
    total_applications: number;
  }> {
    const supabase = getSupabase();

    // Get pending count
    const { count: pendingCount } = await supabase
      .from('leave_onduty_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Get today's approvals
    const { count: approvedToday } = await supabase
      .from('leave_onduty_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('updated_at', `${today}T00:00:00`)
      .lte('updated_at', `${today}T23:59:59`);

    // Get today's rejections
    const { count: rejectedToday } = await supabase
      .from('leave_onduty_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected')
      .gte('updated_at', `${today}T00:00:00`)
      .lte('updated_at', `${today}T23:59:59`);

    // Get total applications
    const { count: totalCount } = await supabase
      .from('leave_onduty_applications')
      .select('*', { count: 'exact', head: true });

    return {
      pending: pendingCount || 0,
      approved_today: approvedToday || 0,
      rejected_today: rejectedToday || 0,
      total_applications: totalCount || 0,
    };
  }

  /**
   * Notify approvers about new application
   */
  static async notifyApprovers(
    applicationId: string,
    approverIds: string[]
  ): Promise<void> {
    // TODO: Implement notification system
    // This will integrate with the notifications module
    console.log('Notifying approvers:', approverIds, 'for application:', applicationId);
  }

  /**
   * Create initial approval records for an application
   */
  static async createApprovalRecords(
    applicationId: string,
    institutionId: string,
    departmentId: string | null,
    semesterId: string | null,
    category: string,
    subCategory: string
  ): Promise<void> {
    const supabase = getSupabase();

    // Get applicable flow
    const { data: flow } = await supabase.rpc('get_applicable_approval_flow', {
      p_institution_id: institutionId,
      p_department_id: departmentId,
      p_semester_id: semesterId,
      p_category: category,
      p_sub_category: subCategory,
    });

    if (!flow) {
      throw new Error('No approval flow configured for this application');
    }

    const flowSteps = flow.flow_steps || [];

    // For sequential flow, create only first step
    // For parallel flow, create all steps
    const stepsToCreate =
      flow.flow_type === 'sequential' ? flowSteps.slice(0, 1) : flowSteps;

    // Create approval records
    const approvals = stepsToCreate.map((step: any) => ({
      application_id: applicationId,
      step_order: step.step_order,
      approver_id: null, // Will be assigned based on role and scope
      approver_role: step.role,
      status: 'pending',
    }));

    const { error } = await supabase
      .from('leave_onduty_approvals')
      .insert(approvals);

    if (error) {
      throw new Error(`Failed to create approval records: ${error.message}`);
    }

    // TODO: Assign approvers based on role and scope
    // TODO: Notify initial approvers
  }

  /**
   * Get approval statistics
   */
  static async getApprovalStatistics(
    approverId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    pending: number;
    approved_today: number;
    rejected_today: number;
    average_turnaround_hours: number;
  }> {
    const supabase = getSupabase();

    // Get pending count
    const { count: pendingCount } = await supabase
      .from('leave_onduty_approvals')
      .select('*', { count: 'exact', head: true })
      .eq('approver_id', approverId)
      .eq('status', 'pending');

    // Get today's approvals
    const today = new Date().toISOString().split('T')[0];

    const { count: approvedToday } = await supabase
      .from('leave_onduty_approvals')
      .select('*', { count: 'exact', head: true })
      .eq('approver_id', approverId)
      .eq('status', 'approved')
      .gte('action_taken_at', `${today}T00:00:00`)
      .lte('action_taken_at', `${today}T23:59:59`);

    const { count: rejectedToday } = await supabase
      .from('leave_onduty_approvals')
      .select('*', { count: 'exact', head: true })
      .eq('approver_id', approverId)
      .eq('status', 'rejected')
      .gte('action_taken_at', `${today}T00:00:00`)
      .lte('action_taken_at', `${today}T23:59:59`);

    // Calculate average turnaround time
    // TODO: Implement average calculation based on created_at to action_taken_at

    return {
      pending: pendingCount || 0,
      approved_today: approvedToday || 0,
      rejected_today: rejectedToday || 0,
      average_turnaround_hours: 0, // TODO: Calculate
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORWARD (v2, 2026-04-21)
  // Transfer this step's pending approval to another staff member. The
  // original approver's row is marked 'forwarded' (audit trail); a NEW
  // pending row is inserted at the same step_order for the forwarded-to
  // staff. Application.current_step is unchanged.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Forward a pending approval to another staff member.
   *
   * Validation:
   *   - forwarder must be the currently-pending approver on the application
   *   - forwarded_to_id must be a profile in the same institution
   *   - cannot forward to yourself
   */
  static async processForward(data: {
    application_id: string;
    approver_id: string;
    forward_to_id: string;
    comments: string;
  }): Promise<void> {
    const supabase = getSupabase();

    if (!data.forward_to_id || data.forward_to_id === data.approver_id) {
      throw new Error('Please pick a different staff member to forward to.');
    }

    const { data: application, error: appError } = await supabase
      .from('leave_onduty_applications')
      .select('id, institution_id, current_step, status, learner_id, approvals:leave_onduty_approvals(*)')
      .eq('id', data.application_id)
      .single();

    if (appError || !application) {
      throw new Error('Application not found');
    }

    if (application.status !== 'pending') {
      throw new Error('Application is not pending approval');
    }

    const pendingRow = (application.approvals || []).find(
      (a: any) => a.approver_id === data.approver_id && a.status === 'pending'
    );

    if (!pendingRow) {
      throw new Error('You are not the current pending approver for this step.');
    }

    // Verify the target profile exists in the same institution. Using
    // maybeSingle so we return a clean error instead of an unhandled rejection
    // when the id is bogus.
    const { data: target } = await supabase
      .from('profiles')
      .select('id, institution_id, full_name')
      .eq('id', data.forward_to_id)
      .maybeSingle();

    if (!target) {
      throw new Error('Forward target not found.');
    }
    if (target.institution_id && target.institution_id !== application.institution_id) {
      throw new Error('Cannot forward to a staff member outside this institution.');
    }

    // Mark the current row as forwarded (keeps the audit trail).
    const { error: markError } = await supabase
      .from('leave_onduty_approvals')
      .update({
        status: 'forwarded',
        forwarded_to_id: data.forward_to_id,
        comments: data.comments,
        action_taken_at: new Date().toISOString(),
      })
      .eq('id', pendingRow.id);

    if (markError) {
      throw new Error(`Failed to mark approval as forwarded: ${markError.message}`);
    }

    // Insert the new pending row for the forwarded-to staff member at the
    // same step_order. approver_role inherited from the original row so
    // downstream logic (dashboard queries, parallel checks) stays consistent.
    const { error: insertError } = await supabase
      .from('leave_onduty_approvals')
      .insert({
        application_id: data.application_id,
        step_order: pendingRow.step_order,
        approver_id: data.forward_to_id,
        approver_role: pendingRow.approver_role,
        status: 'pending',
        forwarded_from_id: data.approver_id,
      });

    if (insertError) {
      // Roll the original row back to pending so the application isn't stuck.
      await supabase
        .from('leave_onduty_approvals')
        .update({
          status: 'pending',
          forwarded_to_id: null,
          comments: null,
          action_taken_at: null,
        })
        .eq('id', pendingRow.id);
      throw new Error(`Failed to forward approval: ${insertError.message}`);
    }

    // Best-effort activity log — never block the happy path.
    (async () => {
      try {
        const template = AcademicActivityTemplates.leaveOndutyApplicationApproved(
          application.learner_id || data.application_id
        );
        await logActivityClient({
          userId: data.approver_id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: data.application_id,
          description: `${template.description} (forwarded)`,
          metadata: {
            sub_type: template.sub_type,
            action: 'forwarded',
            forward_to_id: data.forward_to_id,
            comments: data.comments,
          },
          institutionId: application.institution_id,
        });
      } catch { /* never block */ }
    })();
  }
}
