/**
 * Service Request Approval Service
 *
 * Handles the multi-step approval workflow engine:
 * - Processing approve/reject/return actions
 * - Advancing through approval steps
 * - Auto-fulfillment on final approval
 * - Tracking approval history
 *
 * @module services/service-requests/service-request-approval-service
 * @created 2026-02-09
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  ServiceRequestApproval,
  ProcessApprovalDto,
  ServiceRequestFilters,
  ServiceRequestListResponse,
} from '@/types/service-request';
import { ServiceRequestTimelineService } from './service-request-timeline-service';
import { notifyTmsWebhook } from './transport-webhook';

const getSupabase = async () => await createServerSupabaseClient() as any;

export class ServiceRequestApprovalService {
  /**
   * Process an approval action (approve, reject, or return)
   *
   * This is the core approval engine. It:
   * 1. Validates the request and current step
   * 2. Checks the approver's role matches the step's required role
   * 3. Updates the approval record
   * 4. Advances, completes, or resets the workflow based on the action
   */
  static async processApproval(
    requestId: string,
    dto: ProcessApprovalDto,
    approverId: string
  ): Promise<void> {
    const supabase = await getSupabase();

    // Get the request with its service type and approval steps
    const { data: request, error: reqError } = await supabase
      .from('service_requests')
      .select(`
        *,
        service_type:service_types(
          *,
          approval_steps:service_request_approval_steps(*)
        )
      `)
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      throw new Error('Service request not found');
    }

    if (!['submitted', 'in_review'].includes(request.status)) {
      throw new Error('This request is not awaiting approval');
    }

    const approvalSteps = (request.service_type?.approval_steps || [])
      .sort((a: any, b: any) => a.step_order - b.step_order);

    if (approvalSteps.length === 0) {
      throw new Error('No approval steps configured for this service type');
    }

    // Get the current step info
    const currentStep = approvalSteps.find(
      (s: any) => s.step_order === request.current_approval_step
    );

    if (!currentStep) {
      throw new Error('Current approval step not found');
    }

    // Verify approver's role matches (or is super_admin)
    const { data: approverProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', approverId)
      .single();

    if (profileError || !approverProfile) {
      throw new Error('Approver profile not found');
    }

    const isSuperAdmin = approverProfile.role === 'super_admin';
    if (!isSuperAdmin && approverProfile.role !== currentStep.approver_role) {
      throw new Error(
        `Only users with role "${currentStep.approver_role}" can approve this step`
      );
    }

    // Find or create the approval record for this step
    const { data: existingApproval } = await supabase
      .from('service_request_approvals')
      .select('*')
      .eq('service_request_id', requestId)
      .eq('step_order', currentStep.step_order)
      .eq('action', 'pending')
      .maybeSingle();

    const approvalId = existingApproval?.id;

    if (approvalId) {
      // Update existing approval record
      await supabase
        .from('service_request_approvals')
        .update({
          approver_id: approverId,
          action: dto.action,
          comments: dto.comments || null,
          acted_at: new Date().toISOString(),
        })
        .eq('id', approvalId);
    } else {
      // Create new approval record
      await supabase.from('service_request_approvals').insert({
        service_request_id: requestId,
        approval_step_id: currentStep.id,
        step_order: currentStep.step_order,
        approver_id: approverId,
        action: dto.action,
        comments: dto.comments || null,
        acted_at: new Date().toISOString(),
      });
    }

    // Process the action
    if (dto.action === 'approved') {
      await this.handleApproved(request, approvalSteps, currentStep, approverId);
    } else if (dto.action === 'rejected') {
      await this.handleRejected(request, approverId, dto.comments);
    } else if (dto.action === 'returned') {
      await this.handleReturned(request, currentStep, approverId, dto.comments);
    }
  }

  /**
   * Handle approval: advance to next step or complete
   */
  private static async handleApproved(
    request: any,
    approvalSteps: any[],
    currentStep: any,
    approverId: string
  ): Promise<void> {
    const supabase = await getSupabase();
    const isLastStep = currentStep.step_order >= approvalSteps.length;

    if (isLastStep) {
      // Final approval - mark as approved
      const autoFulfill = request.service_type?.auto_fulfill_on_approval;
      const newStatus = autoFulfill ? 'fulfilled' : 'approved';
      const now = new Date().toISOString();

      const updateData: Record<string, any> = {
        status: newStatus,
        approved_at: now,
        updated_by: approverId,
      };

      if (autoFulfill) {
        updateData.fulfilled_at = now;
        // Set validity expiration if configured
        if (request.service_type?.validity_period_days) {
          const expiresAt = new Date();
          expiresAt.setDate(
            expiresAt.getDate() + request.service_type.validity_period_days
          );
          updateData.validity_expires_at = expiresAt.toISOString();
        }
      }

      await supabase
        .from('service_requests')
        .update(updateData)
        .eq('id', request.id);

      await ServiceRequestTimelineService.addStatusChange(
        request.id,
        approverId,
        request.status,
        newStatus,
        autoFulfill
          ? 'Request approved and automatically fulfilled'
          : 'Request approved'
      );

      // Fire webhook for transport requests (fire-and-forget)
      if (request.service_type?.slug === 'transport-request') {
        notifyTmsWebhook(
          request.id,
          request.request_number,
          request.institution_id
        ).catch((err) =>
          console.error('[service-requests/approvals] Webhook notification failed:', err)
        );
      }
    } else {
      // Advance to next step
      const nextStepOrder = currentStep.step_order + 1;
      const nextStep = approvalSteps.find((s: any) => s.step_order === nextStepOrder);

      await supabase
        .from('service_requests')
        .update({
          status: 'in_review',
          current_approval_step: nextStepOrder,
          updated_by: approverId,
        })
        .eq('id', request.id);

      // Create next pending approval record
      if (nextStep) {
        await supabase.from('service_request_approvals').insert({
          service_request_id: request.id,
          approval_step_id: nextStep.id,
          step_order: nextStep.step_order,
          approver_id: approverId, // Placeholder
          action: 'pending',
        });
      }

      await ServiceRequestTimelineService.addStatusChange(
        request.id,
        approverId,
        request.status,
        'in_review',
        `Step ${currentStep.step_order} (${currentStep.step_name}) approved. Proceeding to step ${nextStepOrder}.`
      );
    }
  }

  /**
   * Handle rejection: set request to rejected
   */
  private static async handleRejected(
    request: any,
    approverId: string,
    comments?: string
  ): Promise<void> {
    const supabase = await getSupabase();

    await supabase
      .from('service_requests')
      .update({
        status: 'rejected',
        updated_by: approverId,
      })
      .eq('id', request.id);

    await ServiceRequestTimelineService.addStatusChange(
      request.id,
      approverId,
      request.status,
      'rejected',
      comments ? `Request rejected: ${comments}` : 'Request rejected'
    );
  }

  /**
   * Handle return: send back for revision
   */
  private static async handleReturned(
    request: any,
    currentStep: any,
    approverId: string,
    comments?: string
  ): Promise<void> {
    const supabase = await getSupabase();

    const restartStep = currentStep.on_return_restart_from_step || 0;

    await supabase
      .from('service_requests')
      .update({
        status: 'returned',
        current_approval_step: restartStep,
        updated_by: approverId,
      })
      .eq('id', request.id);

    await ServiceRequestTimelineService.addStatusChange(
      request.id,
      approverId,
      request.status,
      'returned',
      comments
        ? `Request returned for revision: ${comments}`
        : 'Request returned for revision'
    );
  }

  /**
   * Get requests pending approval for a user based on their role
   */
  static async getPendingApprovalsForUser(
    userRole: string,
    filters?: ServiceRequestFilters
  ): Promise<ServiceRequestListResponse> {
    const supabase = await getSupabase();

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Get steps where this role is the approver
    const { data: matchingSteps } = await supabase
      .from('service_request_approval_steps')
      .select('step_order, service_type_id')
      .eq('approver_role', userRole);

    if (!matchingSteps || matchingSteps.length === 0) {
      return {
        data: [],
        metadata: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const serviceTypeIds = [...new Set(matchingSteps.map((s: any) => s.service_type_id))];
    const stepOrders = [...new Set(matchingSteps.map((s: any) => s.step_order))];

    let query = supabase
      .from('service_requests')
      .select(
        `*,
        service_type:service_types(id, name, slug, icon, color),
        requester:profiles!requester_id(id, full_name, email, avatar_url),
        institution:institutions(id, name)`,
        { count: 'exact' }
      )
      .in('status', ['submitted', 'in_review'])
      .in('service_type_id', serviceTypeIds)
      .in('current_approval_step', stepOrders);

    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[service-requests/approvals] Failed to fetch pending approvals:', error);
      throw new Error(`Failed to fetch pending approvals: ${error.message}`);
    }

    return {
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get count of pending approvals for badge display
   */
  static async getPendingApprovalCount(userRole: string): Promise<number> {
    const supabase = await getSupabase();

    const { data: matchingSteps } = await supabase
      .from('service_request_approval_steps')
      .select('step_order, service_type_id')
      .eq('approver_role', userRole);

    if (!matchingSteps || matchingSteps.length === 0) return 0;

    const serviceTypeIds = [...new Set(matchingSteps.map((s: any) => s.service_type_id))];
    const stepOrders = [...new Set(matchingSteps.map((s: any) => s.step_order))];

    const { count, error } = await supabase
      .from('service_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['submitted', 'in_review'])
      .in('service_type_id', serviceTypeIds)
      .in('current_approval_step', stepOrders);

    if (error) {
      console.error('[service-requests/approvals] Failed to count pending:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Check if a user with the given role can approve a specific request
   */
  static async canUserApprove(
    userRole: string,
    requestId: string
  ): Promise<boolean> {
    const supabase = await getSupabase();

    // Get the request's current step and service type
    const { data: request, error } = await supabase
      .from('service_requests')
      .select('current_approval_step, service_type_id, status')
      .eq('id', requestId)
      .single();

    if (error || !request) return false;

    if (!['submitted', 'in_review'].includes(request.status)) return false;

    if (userRole === 'super_admin') return true;

    // Check if there's a matching step
    const { data: step } = await supabase
      .from('service_request_approval_steps')
      .select('id')
      .eq('service_type_id', request.service_type_id)
      .eq('step_order', request.current_approval_step)
      .eq('approver_role', userRole)
      .maybeSingle();

    return !!step;
  }

  /**
   * Get full approval history for a request
   */
  static async getApprovalHistory(
    requestId: string
  ): Promise<ServiceRequestApproval[]> {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from('service_request_approvals')
      .select(
        `*,
        approver:profiles!approver_id(id, full_name, email),
        approval_step:service_request_approval_steps!approval_step_id(*)`
      )
      .eq('service_request_id', requestId)
      .order('step_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[service-requests/approvals] Failed to fetch approval history:', error);
      throw new Error(`Failed to fetch approval history: ${error.message}`);
    }

    return data || [];
  }
}
