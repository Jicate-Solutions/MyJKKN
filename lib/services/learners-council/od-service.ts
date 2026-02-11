// lib/services/learners-council/od-service.ts
// LC-004: OD Management - Service Layer

import { createClientSupabaseClient } from '@/lib/supabase/client';
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
    const { data, error } = await this.supabase
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
    const { data: chains } = await this.supabase
      .from('lc_od_approval_chains')
      .select('id, name, steps')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .limit(1);

    const chainId = chains && chains.length > 0 ? chains[0].id : null;

    // Generate request number
    const requestNumber = `OD-${Date.now().toString(36).toUpperCase()}`;

    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data: request } = await this.supabase
      .from('lc_od_requests')
      .select('*, chain:lc_od_approval_chains(id, name, steps)')
      .eq('id', requestId)
      .single();

    if (!request) throw new Error('OD request not found');

    const currentStep = request.current_step || 1;
    const chain = request.chain as any;
    const totalSteps = chain?.steps?.length || 1;

    // Record the approval
    const { error: approvalError } = await this.supabase
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

    const { data, error } = await this.supabase
      .from('lc_od_requests')
      .update(updateData)
      .eq('id', requestId)
      .select(OD_REQUEST_SELECT)
      .single();

    if (error) {
      console.error('[learners-council/od] Error updating OD request:', error);
      throw new Error(`Failed to update OD request: ${error.message}`);
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
    // Get current step
    const { data: request } = await this.supabase
      .from('lc_od_requests')
      .select('current_step')
      .eq('id', requestId)
      .single();

    // Record the rejection
    const { error: approvalError } = await this.supabase
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

    const { data, error } = await this.supabase
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

    return data as unknown as LCODRequest;
  }

  /**
   * Get OD requests pending this user's approval
   */
  static async getMyPendingApprovals(approverId: string): Promise<LCODRequest[]> {
    // Get requests where status is submitted or in_review
    // In a full implementation, this would also check the approval chain step
    const { data, error } = await this.supabase
      .from('lc_od_requests')
      .select(OD_REQUEST_SELECT)
      .in('status', ['submitted', 'in_review'])
      .order('submitted_at', { ascending: true });

    if (error) {
      console.error('[learners-council/od] Error fetching pending approvals:', error);
      throw new Error(`Failed to fetch pending approvals: ${error.message}`);
    }

    return (data || []) as unknown as LCODRequest[];
  }

  // ============================================================================
  // APPROVAL CHAIN CONFIGURATION
  // ============================================================================

  /**
   * List approval chains for an institution
   */
  static async getApprovalChains(institutionId: string): Promise<LCODApprovalChain[]> {
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
}
