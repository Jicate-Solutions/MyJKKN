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

// Helper to get untyped client for tables not yet in database.types.ts
const getSupabase = () => createClientSupabaseClient() as any;

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

    // Get approval flow to determine type (sequential/parallel)
    const { data: flow } = await supabase.rpc('get_applicable_approval_flow', {
      p_institution_id: application.institution_id,
      p_department_id: application.department_id,
      p_semester_id: application.semester_id,
      p_category: application.category,
      p_sub_category: application.sub_category,
    });

    // Super admin can approve/reject without approval flow
    if (!flow && !isSuperAdmin) {
      throw new Error('No approval flow configured');
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
      return;
    }

    // Get current approval record for this approver
    const currentApproval = application.approvals?.find(
      (a: any) => a.approver_id === data.approver_id && a.status === 'pending'
    );

    if (!currentApproval) {
      throw new Error('You are not authorized to approve this application');
    }

    // Update approval record
    const { error: updateError } = await supabase
      .from('leave_onduty_approvals')
      .update({
        status: data.status,
        comments: data.comments,
        action_taken_at: new Date().toISOString(),
      })
      .eq('id', currentApproval.id);

    if (updateError) {
      throw new Error(`Failed to update approval: ${updateError.message}`);
    }

    // Handle rejection - immediately reject application
    if (data.status === 'rejected') {
      await this.handleRejection(application.id, data.application_id);
      return;
    }

    // Handle approval based on flow type
    if (flow.flow_type === 'sequential') {
      await this.handleSequentialApproval(application, flow);
    } else {
      await this.handleParallelApproval(application, flow);
    }
  }

  /**
   * Handle rejection - update application status
   */
  private static async handleRejection(
    approvalId: string,
    applicationId: string
  ): Promise<void> {
    const supabase = getSupabase();

    console.log('[leave-onduty/approval] Handling rejection for application:', applicationId);

    const { error: updateError } = await supabase
      .from('leave_onduty_applications')
      .update({ status: 'rejected' })
      .eq('id', applicationId);

    if (updateError) {
      console.error('[leave-onduty/approval] Failed to update application status to rejected:', updateError);
      throw new Error(`Failed to reject application: ${updateError.message}`);
    }

    console.log('[leave-onduty/approval] Application status updated to rejected');

    // TODO: Notify learner of rejection
  }

  /**
   * Handle sequential approval workflow
   */
  private static async handleSequentialApproval(
    application: any,
    flow: any
  ): Promise<void> {
    const supabase = getSupabase();

    const flowSteps = flow.flow_steps || [];
    const currentStep = application.current_step;

    // Check if this is the last step
    if (currentStep >= flowSteps.length) {
      // All steps completed - approve application
      await this.finalizeApproval(application.id);
      return;
    }

    // Move to next step
    const nextStep = currentStep + 1;

    await supabase
      .from('leave_onduty_applications')
      .update({ current_step: nextStep })
      .eq('id', application.id);

    // TODO: Notify next approver
  }

  /**
   * Handle parallel approval workflow
   */
  private static async handleParallelApproval(
    application: any,
    flow: any
  ): Promise<void> {
    const supabase = getSupabase();

    // Get all required approvals
    const flowSteps = flow.flow_steps || [];
    const requiredSteps = flowSteps.filter((step: any) => step.is_required);

    // Get current approval statuses
    const { data: approvals } = await supabase
      .from('leave_onduty_approvals')
      .select('*')
      .eq('application_id', application.id);

    if (!approvals) return;

    // Check if all required approvals are approved
    const allRequiredApproved = requiredSteps.every((step: any) => {
      const approval = approvals.find((a) => a.step_order === step.step_order);
      return approval && approval.status === 'approved';
    });

    if (allRequiredApproved) {
      // All required approvals completed - approve application
      await this.finalizeApproval(application.id);
    }
  }

  /**
   * Finalize approval and trigger attendance update
   */
  private static async finalizeApproval(applicationId: string): Promise<void> {
    const supabase = getSupabase();

    console.log('[leave-onduty/approval] Finalizing approval for application:', applicationId);

    // Update application status
    const { error: updateError } = await supabase
      .from('leave_onduty_applications')
      .update({ status: 'approved' })
      .eq('id', applicationId);

    if (updateError) {
      console.error('[leave-onduty/approval] Failed to update application status:', updateError);
      throw new Error(`Failed to update application status: ${updateError.message}`);
    }

    console.log('[leave-onduty/approval] Application status updated to approved');

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
          approver:profiles(id, full_name, email)
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

    if (!flow) {
      return [];
    }

    const flowSteps = flow.flow_steps || [];
    const approvals = application.approvals || [];

    // Build timeline
    const timeline: ApprovalTimelineStep[] = flowSteps.map((step: any) => {
      const approval = approvals.find((a: any) => a.step_order === step.step_order);

      return {
        step_order: step.step_order,
        role: step.role,
        description: step.description,
        approver_name: approval?.approver?.full_name || null,
        status: approval?.status || 'pending',
        comments: approval?.comments || null,
        action_taken_at: approval?.action_taken_at || null,
        is_current: application.current_step === step.step_order,
        is_required: step.is_required,
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
}
