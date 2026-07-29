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
import { normalizePagination } from './pagination';

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

    // Verify approver is authorized. Two paths:
    //   1) Super admin bypass — always allowed.
    //   2) Step has explicit approver_user_ids — approver must be in that set.
    //      (Role is irrelevant here; the UI let the author pick specific users.)
    //   3) Legacy role-based — approver's profiles.role must match approver_role.
    const { data: approverProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', approverId)
      .single();

    if (profileError || !approverProfile) {
      throw new Error('Approver profile not found');
    }

    const isSuperAdmin = approverProfile.role === 'super_admin';
    const authorizedUserIds: string[] = Array.isArray(currentStep.approver_user_ids)
      ? currentStep.approver_user_ids
      : [];
    const hasMultiApproverList = authorizedUserIds.length > 0;

    if (!isSuperAdmin) {
      const matchesUserList = hasMultiApproverList && authorizedUserIds.includes(approverId);
      const matchesRole = !hasMultiApproverList && approverProfile.role === currentStep.approver_role;

      if (!matchesUserList && !matchesRole) {
        throw new Error(
          hasMultiApproverList
            ? 'You are not authorized to approve this step'
            : `Only users with role "${currentStep.approver_role}" can approve this step`
        );
      }
    }

    // Always INSERT the action row. We used to look up a placeholder pending
    // row first and UPDATE it, but RLS on service_request_approvals hides
    // those placeholders from the actual approver — the lookup silently
    // returned null and the INSERT branch fired anyway, leaving the orphan
    // placeholder behind. With placeholder creation removed (see service-
    // request-service.ts), the approvals table is now strictly an action log.
    await supabase.from('service_request_approvals').insert({
      service_request_id: requestId,
      approval_step_id: currentStep.id,
      step_order: currentStep.step_order,
      approver_id: approverId,
      action: dto.action,
      comments: dto.comments || null,
      acted_at: new Date().toISOString(),
    });

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

      // Bus Pass Request: write the approved route/stop onto the learner's
      // profile so the TMS app can read who needs a bus. Privileged cross-table
      // write → SECURITY DEFINER RPC. Failure is logged, not thrown: the
      // approval status change already committed above.
      if (request.service_type?.slug === 'transport-request') {
        const { error: busPassSyncError } = await supabase.rpc(
          'sync_bus_pass_to_learner_profile',
          { p_request_id: request.id }
        );
        if (busPassSyncError) {
          console.error(
            '[service-requests/approvals] Bus-pass profile sync failed:',
            busPassSyncError
          );
        }
      }
    } else {
      // Advance to next step
      const nextStepOrder = currentStep.step_order + 1;

      await supabase
        .from('service_requests')
        .update({
          status: 'in_review',
          current_approval_step: nextStepOrder,
          updated_by: approverId,
        })
        .eq('id', request.id);

      // Pending state for the next step is represented by service_requests
      // (status='in_review', current_approval_step=N). We no longer insert a
      // placeholder pending row in service_request_approvals — RLS hid it from
      // the next approver and caused duplicate-action-row bugs (see comment
      // above the INSERT in processApproval).

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
   * Build the PostgREST `.or()` filter selecting the service_requests a user
   * may approve, split into two scopes:
   *
   *   • Role-matched steps (approver_role === userRole): institution-scoped
   *     when institutionId is provided — preserves multi-tenant isolation for
   *     the broad role-based path.
   *   • Named-approver steps (userId ∈ approver_user_ids): NOT institution-
   *     scoped, so a user explicitly chosen as approver sees the request even
   *     when it originates in a different institution (cross-institution
   *     approval — mirrors the RLS named-approver policies).
   *
   * Returns an `or=(...)` body string, or null when neither scope matched.
   * Keeps the coarse (service_type_id × current_approval_step) matching the
   * callers already used: a request matches a scope if its type AND its current
   * step both appear in that scope's step set.
   */
  private static buildApproverScopeFilter(
    matchingSteps: any[],
    userRole: string,
    userId: string,
    institutionId?: string
  ): string | null {
    const roleSteps = matchingSteps.filter((s) => s.approver_role === userRole);
    const namedSteps = matchingSteps.filter(
      (s) => Array.isArray(s.approver_user_ids) && s.approver_user_ids.includes(userId)
    );

    const group = (steps: any[], scoped: boolean): string | null => {
      if (steps.length === 0) return null;
      const typeIds = [...new Set(steps.map((s) => s.service_type_id))];
      const stepOrders = [...new Set(steps.map((s) => s.step_order))];
      const parts = [
        `service_type_id.in.(${typeIds.join(',')})`,
        `current_approval_step.in.(${stepOrders.join(',')})`,
      ];
      if (scoped && institutionId) {
        parts.push(`institution_id.eq.${institutionId}`);
      }
      return `and(${parts.join(',')})`;
    };

    const groups = [group(roleSteps, true), group(namedSteps, false)].filter(
      (g): g is string => g !== null
    );
    return groups.length > 0 ? groups.join(',') : null;
  }

  /**
   * Get requests pending approval for a user.
   *
   * A step is considered "assigned to this user" if EITHER:
   *   • the step's approver_role matches the user's role, OR
   *   • the user's id is in the step's approver_user_ids array (multi-approver
   *     mode — a specific subset of named approvers).
   *
   * Named-approver matches are NOT institution-scoped (cross-institution
   * approval); role matches stay scoped to filters.institution_id.
   */
  static async getPendingApprovalsForUser(
    userRole: string,
    userId: string,
    filters?: ServiceRequestFilters
  ): Promise<ServiceRequestListResponse> {
    const supabase = await getSupabase();

    const { page, limit } = normalizePagination(filters?.page, filters?.limit);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Steps this user could act on — role match OR explicit user-id match.
    // PostgREST: `cs` (contains) on an array column uses the @> operator.
    const { data: matchingSteps } = await supabase
      .from('service_request_approval_steps')
      .select('step_order, service_type_id, approver_role, approver_user_ids')
      .or(`approver_role.eq.${userRole},approver_user_ids.cs.{${userId}}`);

    if (!matchingSteps || matchingSteps.length === 0) {
      return {
        data: [],
        metadata: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const orFilter = this.buildApproverScopeFilter(
      matchingSteps,
      userRole,
      userId,
      filters?.institution_id
    );
    if (!orFilter) {
      return { data: [], metadata: { total: 0, page, limit, totalPages: 0 } };
    }

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
      .or(orFilter);

    // Narrow server-side. Filtering client-side would only ever search the
    // current page, so a request on page 40 would look like it didn't exist.
    if (filters?.service_type_id) {
      query = query.eq('service_type_id', filters.service_type_id);
    }
    if (filters?.priority) {
      query = query.eq('priority', filters.priority);
    }
    if (filters?.search) {
      query = query.ilike('request_number', `%${filters.search}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

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
   * Get count of pending approvals for badge display.
   * Matches on role OR explicit user-id assignment (see
   * getPendingApprovalsForUser for the full rationale).
   *
   * Optional institutionId pins the count to a single institution; callers
   * pass profile.institution_id for non-super-admins so the badge agrees
   * with the inbox list.
   */
  static async getPendingApprovalCount(
    userRole: string,
    userId: string,
    institutionId?: string
  ): Promise<number> {
    const supabase = await getSupabase();

    const { data: matchingSteps } = await supabase
      .from('service_request_approval_steps')
      .select('step_order, service_type_id, approver_role, approver_user_ids')
      .or(`approver_role.eq.${userRole},approver_user_ids.cs.{${userId}}`);

    if (!matchingSteps || matchingSteps.length === 0) return 0;

    const orFilter = this.buildApproverScopeFilter(
      matchingSteps,
      userRole,
      userId,
      institutionId
    );
    if (!orFilter) return 0;

    const { count, error } = await supabase
      .from('service_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['submitted', 'in_review'])
      .or(orFilter);

    if (error) {
      console.error('[service-requests/approvals] Failed to count pending:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Check if the given user can approve a specific request.
   * Accepts the role-match path OR the explicit user-id path.
   */
  static async canUserApprove(
    userRole: string,
    userId: string,
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

    // Fetch the step for this request's current position, then check either
    // the role match OR presence in approver_user_ids. Done in a single row
    // read so we see both fields together.
    const { data: step } = await supabase
      .from('service_request_approval_steps')
      .select('approver_role, approver_user_ids')
      .eq('service_type_id', request.service_type_id)
      .eq('step_order', request.current_approval_step)
      .maybeSingle();

    if (!step) return false;

    const userIds: string[] = Array.isArray(step.approver_user_ids)
      ? step.approver_user_ids
      : [];
    const hasMultiApproverList = userIds.length > 0;

    if (hasMultiApproverList) {
      // Multi-approver mode: only listed users may approve (role ignored).
      return userIds.includes(userId);
    }
    // Legacy role-based mode.
    return step.approver_role === userRole;
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
