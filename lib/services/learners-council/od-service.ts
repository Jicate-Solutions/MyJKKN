// lib/services/learners-council/od-service.ts
// LC-004: OD Management - Service Layer

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LCNotificationService } from './notification-service';
import type {
  LCODRequest,
  LCODApproval,
  LCODApprovalChain,
  CreateODRequestDto,
  CreateODApprovalChainDto,
  ODRequestStatus,
} from '@/types/learners-council';

const OD_REQUEST_SELECT = `
  *,
  requester:profiles!requester_id(id, full_name, email),
  chain:lc_od_approval_chains(id, name, steps),
  event:lc_events(id, title),
  approvals:lc_od_approvals(*, approver:profiles!approver_id(id, full_name))
`;

const OD_REQUEST_LIST_SELECT = `
  *,
  requester:profiles!requester_id(id, full_name, email),
  chain:lc_od_approval_chains(id, name),
  event:lc_events(id, title)
`;

export class LCODService {
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // OD REQUEST CRUD
  // ============================================================================

  /**
   * List OD requests with filters and pagination
   */
  static async getODRequests(filters: {
    requester_id?: string;
    institution_id?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: LCODRequest[]; count: number }> {
    const { requester_id, institution_id, status, page = 1, limit = 20 } = filters;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = (this.supabase as any)
      .from('lc_od_requests')
      .select(OD_REQUEST_LIST_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (requester_id) {
      query = query.eq('requester_id', requester_id);
    }
    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[learners-council/od] Error fetching OD requests:', error);
      throw new Error(`Failed to fetch OD requests: ${error.message}`);
    }

    return { data: (data || []) as unknown as LCODRequest[], count: count || 0 };
  }

  /**
   * Get single OD request with all joins
   */
  static async getODRequestById(id: string): Promise<LCODRequest | null> {
    const { data, error } = await (this.supabase as any)
      .from('lc_od_requests')
      .select(OD_REQUEST_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[learners-council/od] Error fetching OD request:', error);
      throw new Error(`Failed to fetch OD request: ${error.message}`);
    }

    return data as unknown as LCODRequest;
  }

  /**
   * Create a new OD request
   * Auto-assigns approval chain based on institution
   */
  static async createODRequest(
    dto: CreateODRequestDto,
    userId: string,
    institutionId: string
  ): Promise<LCODRequest> {
    // Find the active approval chain for this institution
    const { data: chains, error: chainError } = await (this.supabase as any)
      .from('lc_od_approval_chains')
      .select('id, name, steps')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .limit(1);

    if (chainError) {
      console.error('[learners-council/od] Error fetching approval chains:', chainError);
      throw new Error(`Failed to fetch approval chains: ${chainError.message}`);
    }

    if (!chains || chains.length === 0) {
      throw new Error(
        'No active approval chain configured for this institution. Please ask an administrator to set up an OD approval chain before submitting requests.'
      );
    }

    const chainId = chains[0].id;

    // Generate request number
    const requestNumber = `OD-${Date.now().toString(36).toUpperCase()}`;

    const { data, error } = await (this.supabase as any)
      .from('lc_od_requests')
      .insert({
        request_number: requestNumber,
        requester_id: userId,
        institution_id: institutionId,
        event_id: dto.event_id || null,
        chain_id: chainId,
        reason: dto.reason,
        category: 'general',
        start_date: dto.start_date,
        end_date: dto.end_date,
        duration_hours: dto.duration_hours,
        status: 'draft' as ODRequestStatus,
        current_step: 0,
        has_academic_conflict: false,
      })
      .select(OD_REQUEST_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/od] Error creating OD request:', error);
      throw new Error(`Failed to create OD request: ${error.message}`);
    }

    return data as unknown as LCODRequest;
  }

  /**
   * Submit OD request for approval
   */
  static async submitODRequest(id: string): Promise<LCODRequest> {
    const { data, error } = await (this.supabase as any)
      .from('lc_od_requests')
      .update({
        status: 'submitted' as ODRequestStatus,
        submitted_at: new Date().toISOString(),
        current_step: 1,
      })
      .eq('id', id)
      .eq('status', 'draft')
      .select(OD_REQUEST_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/od] Error submitting OD request:', error);
      throw new Error(`Failed to submit OD request: ${error.message}`);
    }

    return data as unknown as LCODRequest;
  }

  // ============================================================================
  // APPROVAL ACTIONS
  // ============================================================================

  /**
   * Approve an OD request step
   */
  static async approveODRequest(
    requestId: string,
    approverId: string,
    comments?: string
  ): Promise<LCODRequest> {
    // Get current request to determine step
    const { data: request } = await (this.supabase as any)
      .from('lc_od_requests')
      .select('*, chain:lc_od_approval_chains(id, name, steps)')
      .eq('id', requestId)
      .single();

    if (!request) throw new Error('OD request not found');

    const currentStep = request.current_step || 1;
    const chain = request.chain as any;
    const totalSteps = chain?.steps?.length || 1;

    // Record the approval
    const { error: approvalError } = await (this.supabase as any)
      .from('lc_od_approvals')
      .insert({
        request_id: requestId,
        approver_id: approverId,
        step_order: currentStep,
        action: 'approve',
        comments: comments || null,
        acted_at: new Date().toISOString(),
      });

    if (approvalError) {
      console.error('[learners-council/od] Error recording approval:', approvalError);
      throw new Error(`Failed to record approval: ${approvalError.message}`);
    }

    // Determine if this was the final step
    const isFullyApproved = currentStep >= totalSteps;
    const updateData: Record<string, unknown> = isFullyApproved
      ? {
          status: 'approved' as ODRequestStatus,
          completed_at: new Date().toISOString(),
        }
      : {
          status: 'in_review' as ODRequestStatus,
          current_step: currentStep + 1,
        };

    const { data, error } = await (this.supabase as any)
      .from('lc_od_requests')
      .update(updateData)
      .eq('id', requestId)
      .select(OD_REQUEST_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/od] Error updating OD request:', error);
      throw new Error(`Failed to update OD request: ${error.message}`);
    }

    // Auto-update attendance if fully approved
    if (isFullyApproved) {
      try {
        await this.autoUpdateAttendance(requestId);
      } catch (err) {
        console.warn('[learners-council/od] Auto attendance update failed:', err);
        // Don't fail the approval if attendance update fails
      }
    }

    // Notify the requestor about approval progress
    try {
      if (request.requester_id) {
        const statusMsg = isFullyApproved
          ? 'Your OD request has been fully approved.'
          : `Your OD request has been approved at step ${currentStep}. Awaiting next approval.`;
        await LCNotificationService.createNotification({
          user_id: request.requester_id,
          type: 'od_approval',
          title: isFullyApproved ? 'OD Request Approved' : 'OD Request Progress',
          message: statusMsg,
          link: `/learners-council/od/${requestId}`,
          reference_id: requestId,
          reference_type: 'od_request',
        });
      }
    } catch (notifErr) {
      console.warn('[learners-council/od] Failed to send approval notification:', notifErr);
    }

    return data as unknown as LCODRequest;
  }

  /**
   * Reject an OD request
   */
  static async rejectODRequest(
    requestId: string,
    approverId: string,
    comments: string
  ): Promise<LCODRequest> {
    // Get current step and requester
    const { data: request } = await (this.supabase as any)
      .from('lc_od_requests')
      .select('current_step, requester_id')
      .eq('id', requestId)
      .single();

    // Record the rejection
    const { error: approvalError } = await (this.supabase as any)
      .from('lc_od_approvals')
      .insert({
        request_id: requestId,
        approver_id: approverId,
        step_order: request?.current_step || 1,
        action: 'reject',
        comments,
        acted_at: new Date().toISOString(),
      });

    if (approvalError) {
      console.error('[learners-council/od] Error recording rejection:', approvalError);
      throw new Error(`Failed to record rejection: ${approvalError.message}`);
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_od_requests')
      .update({
        status: 'rejected' as ODRequestStatus,
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select(OD_REQUEST_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/od] Error rejecting OD request:', error);
      throw new Error(`Failed to reject OD request: ${error.message}`);
    }

    // Notify the requestor about the rejection
    try {
      if (request?.requester_id) {
        await LCNotificationService.createNotification({
          user_id: request.requester_id,
          type: 'od_approval',
          title: 'OD Request Rejected',
          message: `Your OD request was rejected. Reason: ${comments}`,
          link: `/learners-council/od/${requestId}`,
          reference_id: requestId,
          reference_type: 'od_request',
        });
      }
    } catch (notifErr) {
      console.warn('[learners-council/od] Failed to send rejection notification:', notifErr);
    }

    return data as unknown as LCODRequest;
  }

  /**
   * Get OD requests pending this user's approval.
   * Checks the approval chain steps to determine if approverId matches
   * the expected approver_role at the request's current_step.
   */
  static async getMyPendingApprovals(approverId: string): Promise<LCODRequest[]> {
    // Fetch all submitted/in_review requests with chain info
    const { data: requests, error } = await (this.supabase as any)
      .from('lc_od_requests')
      .select(OD_REQUEST_SELECT)
      .in('status', ['submitted', 'in_review'])
      .order('submitted_at', { ascending: true });

    if (error) {
      console.error('[learners-council/od] Error fetching pending approvals:', error);
      throw new Error(`Failed to fetch pending approvals: ${error.message}`);
    }

    if (!requests || requests.length === 0) return [];

    // Get the LC member roles for this approver to match against chain steps
    const { data: memberRoles } = await (this.supabase as any)
      .from('lc_members')
      .select('position_id, lc_positions:position_id(title, category)')
      .eq('user_id', approverId)
      .eq('status', 'active');

    // Get YUVA vertical member roles for this approver
    const { data: yuvaRoles } = await (this.supabase as any)
      .from('yuva_vertical_members')
      .select('role, vertical_id')
      .eq('user_id', approverId)
      .eq('is_active', true);

    // Build a set of approver role strings this user holds
    const approverRoles = new Set<string>();
    approverRoles.add(approverId); // Direct user ID match

    if (memberRoles) {
      for (const m of memberRoles) {
        const pos = m.lc_positions as any;
        if (pos?.title) approverRoles.add(pos.title.toLowerCase().replace(/\s+/g, '_'));
        if (pos?.category) approverRoles.add(pos.category);
      }
    }
    if (yuvaRoles) {
      for (const y of yuvaRoles) {
        if (y.role) approverRoles.add(y.role);
      }
    }

    // Filter requests where the current step's approver_role matches this user's roles
    const filtered = (requests as any[]).filter((req) => {
      const chain = req.chain as any;
      const steps = chain?.steps;
      if (!Array.isArray(steps) || steps.length === 0) return false;

      const currentStep = req.current_step || 1;
      const step = steps.find((s: any) => s.step_order === currentStep);
      if (!step) return false;

      // Check if the approver_role in the step matches any role the user holds
      const stepRole = (step.approver_role || '').toLowerCase().replace(/\s+/g, '_');
      return approverRoles.has(stepRole) || approverRoles.has(step.approver_role);
    });

    return filtered as unknown as LCODRequest[];
  }

  // ============================================================================
  // APPROVAL CHAIN CONFIGURATION
  // ============================================================================

  /**
   * List approval chains for an institution
   */
  static async getApprovalChains(institutionId: string): Promise<LCODApprovalChain[]> {
    const { data, error } = await (this.supabase as any)
      .from('lc_od_approval_chains')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[learners-council/od] Error fetching approval chains:', error);
      throw new Error(`Failed to fetch approval chains: ${error.message}`);
    }

    return (data || []) as unknown as LCODApprovalChain[];
  }

  /**
   * Create a new approval chain
   */
  static async createApprovalChain(
    dto: CreateODApprovalChainDto,
    userId: string
  ): Promise<LCODApprovalChain> {
    const { data, error } = await (this.supabase as any)
      .from('lc_od_approval_chains')
      .insert({
        institution_id: dto.institution_id,
        name: dto.name,
        event_scope: dto.event_scope,
        steps: dto.steps,
        is_active: true,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[learners-council/od] Error creating approval chain:', error);
      throw new Error(`Failed to create approval chain: ${error.message}`);
    }

    return data as unknown as LCODApprovalChain;
  }

  /**
   * Update an approval chain
   */
  static async updateApprovalChain(
    id: string,
    dto: Partial<CreateODApprovalChainDto>
  ): Promise<LCODApprovalChain> {
    const { data, error } = await (this.supabase as any)
      .from('lc_od_approval_chains')
      .update(dto)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[learners-council/od] Error updating approval chain:', error);
      throw new Error(`Failed to update approval chain: ${error.message}`);
    }

    return data as unknown as LCODApprovalChain;
  }

  /**
   * Soft-delete an approval chain by setting is_active to false
   */
  static async deleteApprovalChain(chainId: string): Promise<LCODApprovalChain> {
    const { data, error } = await (this.supabase as any)
      .from('lc_od_approval_chains')
      .update({ is_active: false })
      .eq('id', chainId)
      .select('*')
      .single();

    if (error) {
      console.error('[learners-council/od] Error deleting approval chain:', error);
      throw new Error(`Failed to delete approval chain: ${error.message}`);
    }

    return data as unknown as LCODApprovalChain;
  }

  // ============================================================================
  // OD REQUEST ACTIONS
  // ============================================================================

  /**
   * Cancel an OD request with a reason
   */
  static async cancelODRequest(
    requestId: string,
    reason: string
  ): Promise<LCODRequest> {
    // Only draft, submitted, or in_review requests can be cancelled
    const { data: existing } = await (this.supabase as any)
      .from('lc_od_requests')
      .select('id, status')
      .eq('id', requestId)
      .single();

    if (!existing) {
      throw new Error('OD request not found');
    }
    if (!['draft', 'submitted', 'in_review'].includes(existing.status)) {
      throw new Error(`Cannot cancel a request with status: ${existing.status}`);
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_od_requests')
      .update({
        status: 'cancelled' as ODRequestStatus,
        conflict_details: reason,
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select(OD_REQUEST_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/od] Error cancelling OD request:', error);
      throw new Error(`Failed to cancel OD request: ${error.message}`);
    }

    return data as unknown as LCODRequest;
  }

  /**
   * Reassign an OD request to a new approver with reason (smart correction).
   * Records the reassignment as an audit trail entry in lc_od_approvals.
   */
  static async reassignODRequest(
    requestId: string,
    newApproverId: string,
    reason: string
  ): Promise<LCODRequest> {
    // Get request with current step
    const { data: request } = await (this.supabase as any)
      .from('lc_od_requests')
      .select('*, chain:lc_od_approval_chains(id, name, steps)')
      .eq('id', requestId)
      .single();

    if (!request) {
      throw new Error('OD request not found');
    }
    if (!['submitted', 'in_review'].includes(request.status)) {
      throw new Error(`Cannot reassign a request with status: ${request.status}`);
    }

    // Record the reassignment action as an audit trail entry
    const { error: auditError } = await (this.supabase as any)
      .from('lc_od_approvals')
      .insert({
        request_id: requestId,
        approver_id: newApproverId,
        step_order: request.current_step || 1,
        action: 'reassign',
        comments: reason,
        acted_at: new Date().toISOString(),
      });

    if (auditError) {
      console.error('[learners-council/od] Error recording reassignment:', auditError);
      throw new Error(`Failed to record reassignment: ${auditError.message}`);
    }

    // Fetch updated request
    const { data, error } = await (this.supabase as any)
      .from('lc_od_requests')
      .select(OD_REQUEST_SELECT)
      .eq('id', requestId)
      .single();

    if (error) {
      console.error('[learners-council/od] Error fetching reassigned request:', error);
      throw new Error(`Failed to fetch reassigned request: ${error.message}`);
    }

    return data as unknown as LCODRequest;
  }

  /**
   * Check for academic conflicts (timetable/attendance overlaps).
   * Returns conflict info for the given user and date range.
   * This is a stub that checks for date-based overlaps in daily_attendance.
   */
  static async checkAcademicConflicts(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<{ hasConflict: boolean; details: string | null }> {
    try {
      // Check daily_attendance for existing records in the date range
      const { data: attendanceRecords, error } = await (this.supabase as any)
        .from('daily_attendance')
        .select('id, date, status')
        .eq('student_id', userId)
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) {
        // Table may not exist or schema differs; return no conflict
        console.warn('[learners-council/od] Could not check academic conflicts:', error.message);
        return { hasConflict: false, details: null };
      }

      if (attendanceRecords && attendanceRecords.length > 0) {
        const dates = attendanceRecords.map((r: any) => r.date).join(', ');
        return {
          hasConflict: true,
          details: `Attendance records found for dates: ${dates}. Please verify no exams or mandatory classes overlap.`,
        };
      }

      return { hasConflict: false, details: null };
    } catch (err) {
      console.warn('[learners-council/od] Academic conflict check failed:', err);
      return { hasConflict: false, details: null };
    }
  }

  /**
   * Auto-update attendance for an approved OD request.
   * Marks the learner as OD in daily_attendance for the request date range.
   * Stub: attempts to upsert into daily_attendance; gracefully handles if table schema differs.
   */
  static async autoUpdateAttendance(requestId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get the OD request details
      const { data: request, error: reqError } = await (this.supabase as any)
        .from('lc_od_requests')
        .select('requester_id, start_date, end_date, status, institution_id')
        .eq('id', requestId)
        .single();

      if (reqError || !request) {
        throw new Error('OD request not found');
      }
      if (request.status !== 'approved') {
        throw new Error('OD request must be approved before updating attendance');
      }

      // Generate dates between start_date and end_date
      const dates: string[] = [];
      const start = new Date(request.start_date);
      const end = new Date(request.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }

      // Attempt to upsert OD status into daily_attendance
      const records = dates.map((date) => ({
        student_id: request.requester_id,
        date,
        status: 'OD',
        institution_id: request.institution_id,
      }));

      const { error: upsertError } = await (this.supabase as any)
        .from('daily_attendance')
        .upsert(records, { onConflict: 'student_id,date' });

      if (upsertError) {
        console.warn('[learners-council/od] Could not auto-update attendance:', upsertError.message);
        return { success: false, message: `Attendance update failed: ${upsertError.message}. Manual update may be required.` };
      }

      return { success: true, message: `Attendance marked as OD for ${dates.length} day(s).` };
    } catch (err: any) {
      console.error('[learners-council/od] Auto-update attendance error:', err);
      return { success: false, message: err.message || 'Failed to auto-update attendance' };
    }
  }

  /**
   * Create a bulk OD request for multiple learners.
   * Creates individual OD requests for each learner in a single batch.
   */
  static async bulkODRequest(
    data: {
      event_id?: string;
      reason: string;
      start_date: string;
      end_date: string;
      duration_hours: number;
      learner_ids: string[];
    },
    creatorId: string,
    institutionId: string
  ): Promise<{ created: LCODRequest[]; errors: { learner_id: string; error: string }[] }> {
    if (!data.learner_ids || data.learner_ids.length === 0) {
      throw new Error('At least one learner ID is required for bulk OD request');
    }

    // Find the active approval chain for this institution
    const { data: chains, error: chainError } = await (this.supabase as any)
      .from('lc_od_approval_chains')
      .select('id, name, steps')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .limit(1);

    if (chainError) {
      console.error('[learners-council/od] Error fetching approval chains for bulk:', chainError);
      throw new Error(`Failed to fetch approval chains: ${chainError.message}`);
    }

    if (!chains || chains.length === 0) {
      throw new Error(
        'No active approval chain configured for this institution. Please ask an administrator to set up an OD approval chain before submitting requests.'
      );
    }

    const chainId = chains[0].id;
    const created: LCODRequest[] = [];
    const errors: { learner_id: string; error: string }[] = [];

    // Create individual requests for each learner
    const records = data.learner_ids.map((learnerId) => ({
      request_number: `OD-${Date.now().toString(36).toUpperCase()}-${learnerId.slice(0, 4)}`,
      requester_id: learnerId,
      institution_id: institutionId,
      event_id: data.event_id || null,
      chain_id: chainId,
      reason: data.reason,
      category: 'bulk',
      start_date: data.start_date,
      end_date: data.end_date,
      duration_hours: data.duration_hours,
      status: 'draft' as ODRequestStatus,
      current_step: 0,
      has_academic_conflict: false,
    }));

    const { data: insertedData, error: insertError } = await (this.supabase as any)
      .from('lc_od_requests')
      .insert(records)
      .select(OD_REQUEST_SELECT);

    if (insertError) {
      console.error('[learners-council/od] Error in bulk OD creation:', insertError);
      throw new Error(`Failed to create bulk OD requests: ${insertError.message}`);
    }

    if (insertedData) {
      created.push(...(insertedData as unknown as LCODRequest[]));
    }

    return { created, errors };
  }
}
