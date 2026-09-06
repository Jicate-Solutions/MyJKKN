// lib/services/learners-council/od-service.ts
// LC-004: OD Management - Service Layer

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LCNotificationService } from './notification-service';
import type {
  LCODRequest,
  LCODApprovalChain,
  CreateODRequestDto,
  CreateODApprovalChainDto,
  ODRequestStatus,
} from '@/types/learners-council';
import { classifier, type ClassificationResult } from './classifier-service';

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
  private static supabase = createClientSupabaseClient();

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

    let query = this.supabase
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
   * Pick the approval chain for a request.
   *
   * Order of preference:
   *   1. A chain whose event_scope matches the linked event's scope (newest wins).
   *   2. The college's fallback chain (is_fallback) -- used when the request has no event,
   *      the event has no scope, or no chain matches that scope.
   *
   * "Newest wins" is intentional: several chains may share a scope, and ordering by
   * created_at DESC makes the choice deterministic instead of the previous arbitrary pick.
   */
  private static async resolveChainForRequest(
    institutionId: string,
    eventId: string | null
  ): Promise<{ id: string; name: string; steps: unknown }> {
    // A request is approved by YOUR COLLEGE's chain, so the college has to be known first.
    // The page passes `profile.institution_id || ''`, and an empty string is not a valid
    // UUID -- without this guard Postgres answers 22P02 and the learner is shown the raw
    // text 'invalid input syntax for type uuid: ""', which tells them nothing.
    if (!institutionId || !institutionId.trim()) {
      throw new Error(
        'Your profile is not linked to a college yet, so we cannot work out who should '
        + 'approve this request. Ask the Learners Council office to add your college to '
        + 'your profile, then try again.'
      );
    }

    // Derive the event scope, if this request is tied to an event.
    let eventScope: string | null = null;
    if (eventId) {
      const { data: event } = await this.supabase
        .from('lc_events')
        .select('scope')
        .eq('id', eventId)
        .maybeSingle();
      eventScope = (event as { scope?: string } | null)?.scope || null;
    }

    // 1. Scope match (newest wins).
    if (eventScope) {
      const { data: scoped, error: scopedErr } = await this.supabase
        .from('lc_od_approval_chains')
        .select('id, name, steps')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .eq('event_scope', eventScope)
        .order('created_at', { ascending: false })
        .limit(1);
      if (scopedErr) {
        console.error('[learners-council/od] Error matching chain by scope:', scopedErr);
        throw new Error(
          'We could not look up the approval steps for this event just now. Please try '
          + 'again in a minute. If it keeps happening, tell the Learners Council office.'
        );
      }
      if (scoped && scoped.length > 0) return scoped[0] as { id: string; name: string; steps: unknown };
    }

    // 2. Fallback chain for the college.
    // Cast: is_fallback is newer than the checked-in generated DB types.
    const { data: fallback, error: fbErr } = await (this.supabase.from('lc_od_approval_chains') as any)
      .select('id, name, steps')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .eq('is_fallback', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (fbErr) {
      console.error('[learners-council/od] Error fetching fallback chain:', fbErr);
      throw new Error(
        'We could not look up your college\'s approval steps just now. Please try again '
        + 'in a minute. If it keeps happening, tell the Learners Council office.'
      );
    }
    if (fallback && fallback.length > 0) return fallback[0] as { id: string; name: string; steps: unknown };

    // Two different situations, and the learner can only act on the right one. The old
    // single message talked about "this event" even when the learner had deliberately
    // chosen "No linked event", which sent people looking for a problem that was not there.
    throw new Error(
      eventId
        ? 'No approval steps are set up for this event yet. Ask a Learners Council office '
          + 'bearer to add an approval chain for this kind of event, or to mark one chain as '
          + 'your college\'s default.'
        : 'Your college has no default approval chain, so a request with no linked event has '
          + 'nobody to go to. Ask a Learners Council office bearer to open Approval Chains and '
          + 'mark one chain as the default for your college, then try again.'
    );
  }

  /**
   * Create a new OD request
   * Auto-assigns the approval chain by event scope (see resolveChainForRequest).
   */
  static async createODRequest(
    dto: CreateODRequestDto,
    userId: string,
    institutionId: string
  ): Promise<LCODRequest> {
    const chain = await this.resolveChainForRequest(institutionId, dto.event_id || null);
    const chainId = chain.id;

    // Generate request number
    const requestNumber = `OD-${Date.now().toString(36).toUpperCase()}`;

    // Smart categorization: use classifier when no explicit category provided
    const classification = (dto as any).category
      ? null
      : LCODService.classifyRequest(dto.reason || '');

    const { data, error } = await this.supabase
      .from('lc_od_requests')
      .insert({
        request_number: requestNumber,
        requester_id: userId,
        institution_id: institutionId,
        event_id: dto.event_id || null,
        chain_id: chainId,
        reason: dto.reason,
        category: (dto as any).category || classification?.category || 'general',
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
      throw new Error(
        'We could not save your OD request. Please check the dates and the reason, then '
        + 'try again. If it keeps happening, tell the Learners Council office.'
      );
    }

    return data as unknown as LCODRequest;
  }

  /**
   * Submit OD request for approval
   */
  static async submitODRequest(id: string): Promise<LCODRequest> {
    // Freeze the chain's steps onto the request as it enters the queue, so later edits to
    // the chain cannot change the rules for a request that is already being approved.
    const { data: current } = await this.supabase
      .from('lc_od_requests')
      .select('chain:lc_od_approval_chains(steps)')
      .eq('id', id)
      .single();
    const frozenSteps = (current?.chain as { steps?: unknown } | null)?.steps ?? null;

    const { data, error } = await this.supabase
      .from('lc_od_requests')
      .update({
        status: 'submitted' as ODRequestStatus,
        submitted_at: new Date().toISOString(),
        current_step: 1,
        steps_snapshot: frozenSteps,
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
  // CLASSIFICATION
  // ============================================================================

  /**
   * Classify an OD request reason into a category and priority.
   * Phase 1: Rule-based keyword matching.
   * Future: Swap for AI-based classification without refactoring.
   */
  static classifyRequest(reason: string): ClassificationResult {
    return classifier.classify(reason);
  }

  // ============================================================================
  // APPROVAL ACTIONS
  // ============================================================================

  /**
   * Does an approver satisfy a chain step's approver_role?
   *
   * Bridges the chain's role vocabulary (as offered by the chain builder dropdown:
   * lc_president, lc_vice_president, md, principal, hod, dean, yuva_chair, class_advisor)
   * to the identity signals we actually hold about a user. Used by BOTH the approve action
   * and the pending-approvals list, so the "can I see it" and "can I act on it" answers can
   * never drift apart -- the original bug was that the chains said `lc_president` while the
   * President is only known to the system as position title `President`, so nobody matched.
   *
   * Note: `class_advisor` and `dean` intentionally resolve to nobody -- the system holds no
   * class-advisor mapping and no 'dean' role today. Steps naming them will stall until that
   * data exists; surfaced to the operator rather than silently matched to every faculty.
   */
  private static approverMatchesRole(
    requiredRoleRaw: string,
    ctx: {
      userId: string;
      positionTitle?: string | null;
      positionCategory?: string | null;
      profileRole?: string | null;
      isSuperAdmin?: boolean;
      yuvaRoles?: string[];
    }
  ): boolean {
    const required = (requiredRoleRaw || '').toLowerCase().trim();
    if (!required) return false;

    // Direct user-id pin (a step can name a specific person).
    if (required === ctx.userId) return true;

    const title = (ctx.positionTitle || '').toLowerCase().replace(/\s+/g, '_'); // President -> president
    const category = (ctx.positionCategory || '').toLowerCase();
    const profileRole = (ctx.profileRole || '').toLowerCase();
    const yuva = (ctx.yuvaRoles || []).map((r) => r.toLowerCase());

    // LC office bearers: chains say `lc_president`, the position title is `President`.
    const strippedLc = required.startsWith('lc_') ? required.slice(3) : required;

    // Managing Director: the account is a super admin, not a profile.role of 'md'.
    if (required === 'md' || required === 'managing_director') {
      if (ctx.isSuperAdmin || profileRole === 'super_admin') return true;
    }

    // LC office bearer by position title (president / vice_president / secretary / treasurer).
    if (title && (title === strippedLc || title === required)) return true;

    // Position category (executive / representative / yuva_chair / yuva_co_chair).
    if (category && (category === required || category === strippedLc)) return true;

    // YUVA vertical roles.
    if (required === 'yuva_chair') {
      if (category === 'yuva_chair') return true;
      if (yuva.some((r) => r.endsWith('_chair') && !r.endsWith('_co_chair'))) return true;
    }
    if (yuva.includes(required)) return true;

    // Institutional roles carried on profile.role (principal / hod / faculty / staff).
    if (profileRole && profileRole === required) return true;

    return false;
  }

  /**
   * Gather everything we know about an approver's identity, once, so both the approve
   * action and the pending-approvals list judge role matches the same way.
   */
  private static async buildApproverContext(approverId: string): Promise<{
    userId: string;
    positionTitle: string | null;
    positionCategory: string | null;
    profileRole: string | null;
    isSuperAdmin: boolean;
    yuvaRoles: string[];
  }> {
    const [membership, profile, yuva] = await Promise.all([
      this.supabase
        .from('lc_members')
        .select('position:lc_positions(title, category)')
        .eq('user_id', approverId)
        .eq('status', 'active')
        .maybeSingle(),
      this.supabase
        .from('profiles')
        .select('role, is_super_admin')
        .eq('id', approverId)
        .maybeSingle(),
      this.supabase
        .from('yuva_vertical_members')
        .select('role')
        .eq('user_id', approverId)
        .eq('is_active', true),
    ]);

    return {
      userId: approverId,
      positionTitle: (membership.data?.position as any)?.title ?? null,
      positionCategory: (membership.data?.position as any)?.category ?? null,
      profileRole: (profile.data as any)?.role ?? null,
      isSuperAdmin: (profile.data as any)?.is_super_admin === true,
      yuvaRoles: ((yuva.data as { role?: string }[] | null) || [])
        .map((y) => y.role)
        .filter((r): r is string => !!r),
    };
  }

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
    if (request.status !== 'submitted' && request.status !== 'in_review') {
      throw new Error('OD request is not in a reviewable state');
    }

    const currentStep = request.current_step || 1;
    const chain = request.chain as any;
    // Read the frozen snapshot taken at submit time, not the live chain -- a chain edited
    // after this request entered the queue must not change its rules. (Fallback to the
    // live chain only for any legacy row submitted before snapshots existed.)
    const steps = (request as any).steps_snapshot ?? chain?.steps;
    const totalSteps = Array.isArray(steps) ? steps.length || 1 : 1;

    // Validate approver has the required role for this step
    if (Array.isArray(steps) && steps.length >= currentStep) {
      const stepConfig = steps[currentStep - 1];
      if (stepConfig?.approver_role) {
        const ctx = await this.buildApproverContext(approverId);
        if (!this.approverMatchesRole(stepConfig.approver_role, ctx)) {
          throw new Error(`You do not have the required role (${stepConfig.approver_role}) to approve at this step`);
        }
      }
    }

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
    const { data: request } = await this.supabase
      .from('lc_od_requests')
      .select('current_step, requester_id')
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
    const { data: requests, error } = await this.supabase
      .from('lc_od_requests')
      .select(OD_REQUEST_SELECT)
      .in('status', ['submitted', 'in_review'])
      .order('submitted_at', { ascending: true });

    if (error) {
      console.error('[learners-council/od] Error fetching pending approvals:', error);
      throw new Error(`Failed to fetch pending approvals: ${error.message}`);
    }

    if (!requests || requests.length === 0) return [];

    // Same identity resolution the approve action uses, so a request that shows up in the
    // queue is exactly one the user can actually approve.
    const ctx = await this.buildApproverContext(approverId);

    // Filter requests where the current step's approver_role matches this user.
    // Read the frozen snapshot (rules at submit time), not the live chain.
    const filtered = (requests as any[]).filter((req) => {
      const chain = req.chain as any;
      const steps = req.steps_snapshot ?? chain?.steps;
      if (!Array.isArray(steps) || steps.length === 0) return false;

      const currentStep = req.current_step || 1;
      const step = steps.find((s: any) => s.step_order === currentStep);
      if (!step?.approver_role) return false;

      return this.approverMatchesRole(step.approver_role, ctx);
    });

    return filtered as unknown as LCODRequest[];
  }

  // ============================================================================
  // APPROVAL CHAIN CONFIGURATION
  // ============================================================================

  /**
   * List approval chains for an institution
   */
  static async getApprovalChains(institutionId?: string): Promise<LCODApprovalChain[]> {
    let query = this.supabase
      .from('lc_od_approval_chains')
      .select('*')
      .order('created_at', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;

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
      } as any)
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
      .update(dto as any)
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
   * Mark a chain as its college's fallback ("use when nothing else matches").
   * Delegates to fn_lc_set_fallback_chain, which clears the college's other fallback and
   * sets this one atomically (avoiding the one-fallback-per-college unique index), and is
   * gated to LC office bearers / super admins.
   */
  static async setFallbackChain(chainId: string): Promise<void> {
    // Cast: fn_lc_set_fallback_chain is newer than the checked-in generated DB types.
    const { error } = await (this.supabase.rpc as any)('fn_lc_set_fallback_chain', { p_chain_id: chainId });
    if (error) {
      console.error('[learners-council/od] Error setting fallback chain:', error);
      throw new Error(`Failed to set default chain: ${error.message}`);
    }
  }

  /**
   * Soft-delete an approval chain by setting is_active to false
   */
  static async deleteApprovalChain(chainId: string): Promise<LCODApprovalChain> {
    const { data, error } = await this.supabase
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
    const { data: existing } = await this.supabase
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

    const { data, error } = await this.supabase
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
    const { data: request } = await this.supabase
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
    const { error: auditError } = await this.supabase
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
    const { data, error } = await this.supabase
      .from('lc_od_requests')
      .select(OD_REQUEST_SELECT)
      .eq('id', requestId)
      .single();

    if (error) {
      console.error('[learners-council/od] Error fetching reassigned request:', error);
      throw new Error(`Failed to fetch reassigned request: ${error.message}`);
    }

    // Notify the new approver about the reassignment
    try {
      await LCNotificationService.createNotification({
        user_id: newApproverId,
        type: 'od_approval',
        title: 'OD Request Reassigned to You',
        message: `An OD request has been reassigned to you for review. Reason: ${reason}`,
        link: `/learners-council/od/${requestId}`,
        reference_id: requestId,
        reference_type: 'od_request',
      });
    } catch (notifErr) {
      console.warn('[learners-council/od] Failed to send reassignment notification:', notifErr);
    }

    return data as unknown as LCODRequest;
  }

  /**
   * Check for academic conflicts (timetable/attendance overlaps).
   * Returns conflict info for the given user and date range.
   * Checks for date-based overlaps in daily_attendance; gracefully handles if table schema differs.
   */
  static async checkAcademicConflicts(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<{ hasConflict: boolean; details: string | null }> {
    try {
      // Check daily_attendance for existing records in the date range
      // Cast: daily_attendance is not in the checked-in generated DB types.
      const { data: attendanceRecords, error } = await (this.supabase as any).from('daily_attendance')
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
   * Attempts to upsert into daily_attendance; gracefully handles if table schema differs.
   */
  static async autoUpdateAttendance(requestId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get the OD request details
      const { data: request, error: reqError } = await this.supabase
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

      // Cast: daily_attendance is not in the checked-in generated DB types.
      const { error: upsertError } = await (this.supabase as any).from('daily_attendance')
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
    _creatorId: string,
    institutionId: string
  ): Promise<{ created: LCODRequest[]; errors: { learner_id: string; error: string }[] }> {
    if (!data.learner_ids || data.learner_ids.length === 0) {
      throw new Error('At least one learner ID is required for bulk OD request');
    }

    // Find the active approval chain for this institution
    const { data: chains, error: chainError } = await this.supabase
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

    const { data: insertedData, error: insertError } = await this.supabase
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
