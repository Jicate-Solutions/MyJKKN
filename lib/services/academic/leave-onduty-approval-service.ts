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
import { sendNotification } from '@/lib/services/notification/notification-service';
import {
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel,
} from '@/types/notification';

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

    if (!flow) {
      throw new Error('No approval flow configured');
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

    await supabase
      .from('leave_onduty_applications')
      .update({ status: 'rejected' })
      .eq('id', applicationId);

    // Notify learner of rejection
    const { data: rejectedApp } = await supabase
      .from('leave_onduty_applications')
      .select('learner_id, category, sub_category')
      .eq('id', applicationId)
      .single();

    if (rejectedApp?.learner_id) {
      try {
        await sendNotification({
          user_ids: [rejectedApp.learner_id],
          type: NotificationType.ERROR,
          category: NotificationCategory.APPROVAL,
          priority: NotificationPriority.HIGH,
          title: 'Leave/OnDuty Application Rejected',
          message: `Your ${rejectedApp.category} application (${rejectedApp.sub_category}) has been rejected.`,
          metadata: {
            reference_id: applicationId,
            reference_type: 'leave_onduty_application',
          },
          action_url: `/academic/leave-onduty/applications/${applicationId}`,
          action_label: 'View Application',
          channels: [NotificationChannel.IN_APP],
        });
      } catch (notifError) {
        console.warn('[leave-approval] Failed to send rejection notification:', notifError);
      }
    }
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

    // Notify next approver (if approval record exists with an assigned approver)
    const { data: nextApprovals } = await supabase
      .from('leave_onduty_approvals')
      .select('approver_id')
      .eq('application_id', application.id)
      .eq('step_order', nextStep)
      .eq('status', 'pending');

    if (nextApprovals && nextApprovals.length > 0) {
      const nextApproverIds = nextApprovals
        .map((a: any) => a.approver_id)
        .filter(Boolean) as string[];
      if (nextApproverIds.length > 0) {
        try {
          await sendNotification({
            user_ids: nextApproverIds,
            type: NotificationType.WARNING,
            category: NotificationCategory.APPROVAL,
            priority: NotificationPriority.HIGH,
            title: 'Leave/OnDuty Approval Required',
            message: `A ${application.category} application requires your approval (Step ${nextStep}).`,
            metadata: {
              reference_id: application.id,
              reference_type: 'leave_onduty_application',
            },
            action_url: `/academic/leave-onduty/approvals`,
            action_label: 'Review Application',
            channels: [NotificationChannel.IN_APP],
          });
        } catch (notifError) {
          console.warn('[leave-approval] Failed to notify next approver:', notifError);
        }
      }
    }
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

    // Update application status
    await supabase
      .from('leave_onduty_applications')
      .update({ status: 'approved' })
      .eq('id', applicationId);

    // Trigger attendance integration
    await LeaveOndutyAttendanceIntegrationService.updateAttendanceOnApproval(
      applicationId
    );

    // Notify learner of approval
    const { data: approvedApp } = await supabase
      .from('leave_onduty_applications')
      .select('learner_id, category, sub_category')
      .eq('id', applicationId)
      .single();

    if (approvedApp?.learner_id) {
      try {
        await sendNotification({
          user_ids: [approvedApp.learner_id],
          type: NotificationType.SUCCESS,
          category: NotificationCategory.APPROVAL,
          priority: NotificationPriority.NORMAL,
          title: 'Leave/OnDuty Application Approved',
          message: `Your ${approvedApp.category} application (${approvedApp.sub_category}) has been approved.`,
          metadata: {
            reference_id: applicationId,
            reference_type: 'leave_onduty_application',
          },
          action_url: `/academic/leave-onduty/applications/${applicationId}`,
          action_label: 'View Application',
          channels: [NotificationChannel.IN_APP],
        });
      } catch (notifError) {
        console.warn('[leave-approval] Failed to send approval notification:', notifError);
      }
    }
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
        application:leave_onduty_applications(
          *,
          learner:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            register_number,
            student_email
          ),
          section:sections(id, section_name)
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
   * Notify approvers about new application
   */
  static async notifyApprovers(
    applicationId: string,
    approverIds: string[]
  ): Promise<void> {
    if (!approverIds.length) return;

    const supabase = getSupabase();

    // Get application details for the notification message
    const { data: application } = await supabase
      .from('leave_onduty_applications')
      .select('category, sub_category')
      .eq('id', applicationId)
      .single();

    try {
      await sendNotification({
        user_ids: approverIds,
        type: NotificationType.WARNING,
        category: NotificationCategory.APPROVAL,
        priority: NotificationPriority.HIGH,
        title: 'Leave/OnDuty Approval Required',
        message: `A new ${application?.category || 'leave/onduty'} application (${application?.sub_category || ''}) requires your approval.`,
        metadata: {
          reference_id: applicationId,
          reference_type: 'leave_onduty_application',
        },
        action_url: `/academic/leave-onduty/approvals`,
        action_label: 'Review Application',
        channels: [NotificationChannel.IN_APP],
      });
    } catch (notifError) {
      console.warn('[leave-approval] Failed to notify approvers:', notifError);
    }
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

    // Notify initial approvers (those with assigned approver_id)
    const { data: createdApprovals } = await supabase
      .from('leave_onduty_approvals')
      .select('approver_id')
      .eq('application_id', applicationId)
      .eq('status', 'pending');

    if (createdApprovals) {
      const initialApproverIds = createdApprovals
        .map((a: any) => a.approver_id)
        .filter(Boolean) as string[];
      if (initialApproverIds.length > 0) {
        await this.notifyApprovers(applicationId, initialApproverIds);
      }
    }
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

    // Calculate average turnaround time (created_at to action_taken_at)
    let turnaroundQuery: any = supabase
      .from('leave_onduty_approvals')
      .select('created_at, action_taken_at')
      .eq('approver_id', approverId)
      .not('action_taken_at', 'is', null);

    if (startDate) {
      turnaroundQuery = turnaroundQuery.gte('action_taken_at', startDate);
    }
    if (endDate) {
      turnaroundQuery = turnaroundQuery.lte('action_taken_at', endDate);
    }

    const { data: completedApprovals } = await turnaroundQuery;

    let averageTurnaroundHours = 0;
    if (completedApprovals && completedApprovals.length > 0) {
      const totalHours = completedApprovals.reduce((sum: number, a: any) => {
        const created = new Date(a.created_at).getTime();
        const acted = new Date(a.action_taken_at).getTime();
        return sum + (acted - created) / (1000 * 60 * 60);
      }, 0);
      averageTurnaroundHours =
        Math.round((totalHours / completedApprovals.length) * 10) / 10;
    }

    return {
      pending: pendingCount || 0,
      approved_today: approvedToday || 0,
      rejected_today: rejectedToday || 0,
      average_turnaround_hours: averageTurnaroundHours,
    };
  }
}
