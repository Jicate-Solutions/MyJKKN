// lib/services/learner-profile-change-service.ts
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  ProfileChangeRequest,
  CreateChangeRequestDto,
  ApproveRequestDto,
  RejectRequestDto,
  ChangeRequestFilters,
} from '@/types/learner-profile-change';
import type { ChangeRequestAnalytics, InstitutionChangeRequestStats } from '@/types/learner-dashboard';
import { LearnerProfileAuditService } from './learner-profile-audit-service';

export class LearnerProfileChangeService {
  /**
   * Get user's effective roles (profiles.role + user_roles assignments)
   * Used for multi-role access checks
   */
  static async getUserEffectiveRoles(userId: string): Promise<string[]> {
    const supabase = createServiceRoleClient();

    const roles = new Set<string>();

    // Get legacy profile role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profile?.role) roles.add(profile.role);

    // Get multi-role assignments
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('custom_roles!inner(role_key)')
      .eq('user_id', userId);

    if (userRoles) {
      userRoles.forEach((ur: any) => {
        if (ur.custom_roles?.role_key) roles.add(ur.custom_roles.role_key);
      });
    }

    return Array.from(roles);
  }

  /**
   * Create a new profile change request
   * Validates: No pending request exists, only active students, only editable fields
   */
  static async createChangeRequest(
    dto: CreateChangeRequestDto,
    submittedBy: string
  ): Promise<ProfileChangeRequest> {
    const supabase = await createClient();

    console.log('[learner-profile-change-service] Creating change request:', {
      learner_id: dto.learner_id,
      fields_count: Object.keys(dto.changed_fields).length,
    });

    // Validate learner exists and is active
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('id, lifecycle_status, first_name, last_name')
      .eq('id', dto.learner_id)
      .single();

    if (learnerError || !learner) {
      throw new Error('Learner not found');
    }

    if (learner.lifecycle_status !== 'active') {
      throw new Error('Only active students can submit profile change requests');
    }

    // Check for existing pending request
    const { data: existingRequest } = await supabase
      .from('profile_change_requests')
      .select('id')
      .eq('learner_id', dto.learner_id)
      .eq('request_status', 'pending')
      .maybeSingle();

    if (existingRequest) {
      throw new Error('You already have a pending change request. Please wait for approval.');
    }

    // Validate at least one field changed
    if (Object.keys(dto.changed_fields).length === 0) {
      throw new Error('No changes detected');
    }

    // Insert change request
    const { data: request, error: insertError } = await supabase
      .from('profile_change_requests')
      .insert({
        learner_id: dto.learner_id,
        changed_fields: dto.changed_fields,
        fields_summary: dto.fields_summary,
        submitted_by: submittedBy,
        request_status: 'pending',
      })
      .select(`
        *,
        learner:learners_profiles(id, first_name, last_name, roll_number),
        submitter:profiles!submitted_by(id, full_name, email)
      `)
      .single();

    if (insertError) {
      console.error('[learner-profile-change-service] Error creating request:', insertError);
      throw new Error(`Failed to create change request: ${insertError.message}`);
    }

    console.log('[learner-profile-change-service] Change request created:', request.id);

    return request;
  }

  /**
   * Get a single change request by ID
   */
  static async getChangeRequest(id: string): Promise<ProfileChangeRequest> {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('profile_change_requests')
      .select(`
        *,
        learner:learners_profiles(
          id, first_name, last_name, roll_number, college_email,
          institution_id, department_id, degree_id, program_id, semester_id,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name)
        ),
        submitter:profiles!submitted_by(id, full_name, email),
        reviewer:profiles!reviewed_by(id, full_name, email)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new Error('Change request not found');
    }

    return data;
  }

  /**
   * Get pending change request for a learner (if any)
   */
  static async getPendingChangeRequest(
    learnerId: string
  ): Promise<ProfileChangeRequest | null> {
    const supabase = await createClient();

    const { data } = await supabase
      .from('profile_change_requests')
      .select(`
        *,
        learner:learners_profiles(id, first_name, last_name),
        submitter:profiles!submitted_by(id, full_name, email)
      `)
      .eq('learner_id', learnerId)
      .eq('request_status', 'pending')
      .maybeSingle();

    return data;
  }

  /**
   * Get all change requests for a learner (history)
   * Returns all requests regardless of status, ordered by most recent
   */
  static async getAllChangeRequestsForLearner(
    learnerId: string
  ): Promise<ProfileChangeRequest[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('profile_change_requests')
      .select(`
        *,
        learner:learners_profiles(id, first_name, last_name, roll_number),
        submitter:profiles!submitted_by(id, full_name, email),
        reviewer:profiles!reviewed_by(id, full_name, email)
      `)
      .eq('learner_id', learnerId)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('[learner-profile-change-service] Error fetching all requests:', error);
      throw new Error('Failed to fetch change request history');
    }

    return data || [];
  }

  /**
   * Get pending requests with filters (for HOD/Staff)
   * Applies role-based filtering
   * Uses PostgREST !inner join to filter by institution/department server-side,
   * avoiding URL length limits from large .in() clauses.
   */
  static async getPendingRequests(
    filters: ChangeRequestFilters = {}
  ): Promise<{ data: ProfileChangeRequest[]; total: number }> {
    // Use service role client for admin queries - filtering is applied at the page level
    const supabase = createServiceRoleClient();

    // Use !inner join when filtering by institution/department so PostgreSQL
    // handles the filtering server-side (avoids PostgREST URL length limits
    // that occur when passing large UUID arrays via .in() clause).
    const needsInnerJoin = !!(filters.institution_id || filters.department_id);

    const learnerJoin = needsInnerJoin
      ? 'learner:learners_profiles!inner'
      : 'learner:learners_profiles';

    let query = supabase
      .from('profile_change_requests')
      .select(
        `
        *,
        ${learnerJoin}(
          id, first_name, last_name, roll_number, college_email,
          institution_id, department_id, degree_id, program_id, semester_id,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name)
        ),
        submitter:profiles!submitted_by(id, full_name, email)
      `,
        { count: 'estimated' }
      )
      .eq('request_status', filters.status || 'pending')
      .order('submitted_at', { ascending: false });

    // Filter on the joined learner table — handled entirely in PostgreSQL
    if (filters.institution_id) {
      query = query.eq('learner.institution_id', filters.institution_id);
    }
    if (filters.department_id) {
      query = query.eq('learner.department_id', filters.department_id);
    }

    if (filters.learner_id) {
      query = query.eq('learner_id', filters.learner_id);
    }

    if (filters.submitted_after) {
      query = query.gte('submitted_at', filters.submitted_after);
    }

    if (filters.submitted_before) {
      query = query.lte('submitted_at', filters.submitted_before);
    }

    // Pagination - skip when no limit specified to fetch all records
    if (filters.limit) {
      const page = filters.page || 1;
      const limit = filters.limit;
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[learner-profile-change-service] Error fetching requests:', error);
      throw new Error(`Failed to fetch change requests: ${error.message}`);
    }

    return {
      data: data || [],
      total: count || 0,
    };
  }

  /**
   * Approve a change request
   * Updates learner profile with new values
   * Creates audit log entry
   */
  static async approveChangeRequest(
    requestId: string,
    dto: ApproveRequestDto,
    reviewedBy: string
  ): Promise<ProfileChangeRequest> {
    const supabase = createServiceRoleClient();

    console.log('[learner-profile-change-service] Approving request:', requestId);

    // Get the request
    const request = await this.getChangeRequest(requestId);

    if (request.request_status !== 'pending') {
      throw new Error('Only pending requests can be approved');
    }

    // Check approval permission
    const canApprove = await this.checkApprovalPermission(reviewedBy, request.learner_id);
    if (!canApprove) {
      throw new Error('Insufficient permissions to approve this request');
    }

    // Start transaction: Update learner profile + Update request + Create audit log
    try {
      // 1. Update learner profile with new values
      const updateData: Record<string, any> = {};
      Object.entries(request.changed_fields).forEach(([key, change]) => {
        updateData[key] = change.new;
      });

      const { error: updateError } = await supabase
        .from('learners_profiles')
        .update(updateData)
        .eq('id', request.learner_id);

      if (updateError) {
        throw new Error(`Failed to update learner profile: ${updateError.message}`);
      }

      console.log('[learner-profile-change-service] Learner profile updated');

      // 2. Update change request status
      const { data: updatedRequest, error: requestError } = await supabase
        .from('profile_change_requests')
        .update({
          request_status: 'approved',
          reviewed_by: reviewedBy,
          reviewed_at: new Date().toISOString(),
          review_comments: dto.review_comments,
        })
        .eq('id', requestId)
        .select(`
          *,
          learner:learners_profiles(id, first_name, last_name, roll_number),
          submitter:profiles!submitted_by(id, full_name, email),
          reviewer:profiles!reviewed_by(id, full_name, email)
        `)
        .single();

      if (requestError || !updatedRequest) {
        throw new Error(`Failed to update request: ${requestError?.message}`);
      }

      // 3. Create audit log entry
      await LearnerProfileAuditService.createAuditEntry({
        learner_id: request.learner_id,
        change_request_id: requestId,
        action_type: 'approved',
        changed_fields: request.changed_fields,
        performed_by: reviewedBy,
        comments: dto.review_comments,
      });

      console.log('[learner-profile-change-service] Request approved successfully');

      return updatedRequest;
    } catch (error: any) {
      console.error('[learner-profile-change-service] Error approving request:', error);
      throw error;
    }
  }

  /**
   * Reject a change request
   * Does NOT update learner profile
   * Creates audit log entry
   */
  static async rejectChangeRequest(
    requestId: string,
    dto: RejectRequestDto,
    reviewedBy: string
  ): Promise<ProfileChangeRequest> {
    const supabase = createServiceRoleClient();

    console.log('[learner-profile-change-service] Rejecting request:', requestId);

    // Get the request
    const request = await this.getChangeRequest(requestId);

    if (request.request_status !== 'pending') {
      throw new Error('Only pending requests can be rejected');
    }

    // Check approval permission
    const canApprove = await this.checkApprovalPermission(reviewedBy, request.learner_id);
    if (!canApprove) {
      throw new Error('Insufficient permissions to reject this request');
    }

    // Validation: review_comments required for rejection
    if (!dto.review_comments || dto.review_comments.trim().length === 0) {
      throw new Error('Rejection reason is required');
    }

    // Update request status to rejected
    const { data: updatedRequest, error: requestError } = await supabase
      .from('profile_change_requests')
      .update({
        request_status: 'rejected',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_comments: dto.review_comments,
      })
      .eq('id', requestId)
      .select(`
        *,
        learner:learners_profiles(id, first_name, last_name, roll_number),
        submitter:profiles!submitted_by(id, full_name, email),
        reviewer:profiles!reviewed_by(id, full_name, email)
      `)
      .single();

    if (requestError || !updatedRequest) {
      throw new Error(`Failed to reject request: ${requestError?.message}`);
    }

    // Create audit log entry
    await LearnerProfileAuditService.createAuditEntry({
      learner_id: request.learner_id,
      change_request_id: requestId,
      action_type: 'rejected',
      changed_fields: request.changed_fields,
      performed_by: reviewedBy,
      comments: dto.review_comments,
    });

    console.log('[learner-profile-change-service] Request rejected successfully');

    return updatedRequest;
  }

  /**
   * Bulk approve multiple change requests
   * Loops through each request using the existing approveChangeRequest method
   * which handles permission checks and audit logging per item.
   * Returns per-item results so the UI can report partial success.
   */
  static async bulkApproveRequests(
    requestIds: string[],
    dto: ApproveRequestDto,
    reviewedBy: string
  ): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of requestIds) {
      try {
        await this.approveChangeRequest(id, dto, reviewedBy);
        succeeded.push(id);
      } catch (error: any) {
        failed.push({ id, error: error.message || 'Unknown error' });
      }
    }

    console.log(
      `[learner-profile-change-service] Bulk approve complete: ${succeeded.length} succeeded, ${failed.length} failed`
    );

    return { succeeded, failed };
  }

  /**
   * Bulk reject multiple change requests
   * Same pattern as bulkApproveRequests — loops through each request
   * using the existing rejectChangeRequest method.
   */
  static async bulkRejectRequests(
    requestIds: string[],
    dto: RejectRequestDto,
    reviewedBy: string
  ): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of requestIds) {
      try {
        await this.rejectChangeRequest(id, dto, reviewedBy);
        succeeded.push(id);
      } catch (error: any) {
        failed.push({ id, error: error.message || 'Unknown error' });
      }
    }

    console.log(
      `[learner-profile-change-service] Bulk reject complete: ${succeeded.length} succeeded, ${failed.length} failed`
    );

    return { succeeded, failed };
  }

  /**
   * Cancel a change request (student action)
   */
  static async cancelChangeRequest(
    requestId: string,
    cancelledBy: string
  ): Promise<ProfileChangeRequest> {
    const supabase = await createClient();

    const request = await this.getChangeRequest(requestId);

    if (request.request_status !== 'pending') {
      throw new Error('Only pending requests can be cancelled');
    }

    // Verify student owns this request
    if (request.submitted_by !== cancelledBy) {
      throw new Error('You can only cancel your own requests');
    }

    const { data: updatedRequest, error } = await supabase
      .from('profile_change_requests')
      .update({
        request_status: 'cancelled',
        reviewed_by: cancelledBy,
        reviewed_at: new Date().toISOString(),
        review_comments: 'Cancelled by student',
      })
      .eq('id', requestId)
      .select(`
        *,
        learner:learners_profiles(id, first_name, last_name),
        submitter:profiles!submitted_by(id, full_name, email)
      `)
      .single();

    if (error || !updatedRequest) {
      throw new Error(`Failed to cancel request: ${error?.message}`);
    }

    // Create audit log
    await LearnerProfileAuditService.createAuditEntry({
      learner_id: request.learner_id,
      change_request_id: requestId,
      action_type: 'cancelled',
      changed_fields: request.changed_fields,
      performed_by: cancelledBy,
      comments: 'Cancelled by student',
    });

    return updatedRequest;
  }

  /**
   * Get change request analytics for the dashboard
   * Fetches all requests with institution data and computes stats client-side.
   * Change request volume is small enough (hundreds) to aggregate in-memory.
   */
  static async getChangeRequestAnalytics(
    filters?: { institutionId?: string }
  ): Promise<ChangeRequestAnalytics> {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('profile_change_requests')
      .select(`
        id,
        request_status,
        changed_fields,
        fields_summary,
        submitted_at,
        reviewed_at,
        learner:learners_profiles!inner(
          institution_id,
          institution:institutions(name)
        )
      `)
      .order('submitted_at', { ascending: false });

    if (filters?.institutionId) {
      query = query.eq('learner.institution_id', filters.institutionId);
    }

    const { data: requests, error } = await query;

    if (error) {
      console.error('[learner-profile-change-service] Analytics query failed:', error);
      throw new Error(`Failed to fetch change request analytics: ${error.message}`);
    }

    const all = requests || [];
    const total = all.length;

    // --- Status counts ---
    const pending = all.filter((r) => r.request_status === 'pending').length;
    const approved = all.filter((r) => r.request_status === 'approved').length;
    const rejected = all.filter((r) => r.request_status === 'rejected').length;
    const cancelled = all.filter((r) => r.request_status === 'cancelled').length;
    const decided = approved + rejected;
    const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : 0;

    // --- Average review time ---
    const reviewedRequests = all.filter((r) => r.submitted_at && r.reviewed_at);
    let averageReviewTimeHours = 0;
    if (reviewedRequests.length > 0) {
      const totalHours = reviewedRequests.reduce((sum, r) => {
        const submitted = new Date(r.submitted_at).getTime();
        const reviewed = new Date(r.reviewed_at!).getTime();
        return sum + (reviewed - submitted) / (1000 * 60 * 60);
      }, 0);
      averageReviewTimeHours = Math.round((totalHours / reviewedRequests.length) * 10) / 10;
    }

    // --- Institution breakdown ---
    const institutionMap = new Map<string, InstitutionChangeRequestStats>();
    for (const r of all) {
      const learner = r.learner as any;
      const instId = learner?.institution_id;
      const instName = learner?.institution?.name || 'Unknown';
      if (!instId) continue;

      if (!institutionMap.has(instId)) {
        institutionMap.set(instId, {
          institution_id: instId,
          institution_name: instName,
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          approval_rate: 0,
        });
      }
      const inst = institutionMap.get(instId)!;
      inst.total++;
      if (r.request_status === 'pending') inst.pending++;
      if (r.request_status === 'approved') inst.approved++;
      if (r.request_status === 'rejected') inst.rejected++;
    }
    // Compute approval rates per institution (approved / total so it matches the table visually)
    const byInstitution = Array.from(institutionMap.values()).map((inst) => ({
      ...inst,
      approval_rate:
        inst.total > 0
          ? Math.round((inst.approved / inst.total) * 100)
          : 0,
    }));
    byInstitution.sort((a, b) => b.total - a.total);

    // --- Top changed fields ---
    const fieldCounts = new Map<string, number>();
    for (const r of all) {
      // fields_summary is an array of field names
      const fields: string[] = r.fields_summary || [];
      for (const field of fields) {
        fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
      }
    }
    const topChangedFields = Array.from(fieldCounts.entries())
      .map(([field, count]) => ({
        field,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // --- Requests by date (last 30 days) ---
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateMap = new Map<string, number>();
    // Initialize all 30 days
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      dateMap.set(d.toISOString().split('T')[0], 0);
    }
    for (const r of all) {
      const dateKey = new Date(r.submitted_at).toISOString().split('T')[0];
      if (dateMap.has(dateKey)) {
        dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + 1);
      }
    }
    const requestsByDate = Array.from(dateMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // --- Status distribution (for pie chart) ---
    const statusEntries = [
      { status: 'Pending', count: pending },
      { status: 'Approved', count: approved },
      { status: 'Rejected', count: rejected },
      { status: 'Cancelled', count: cancelled },
    ].filter((s) => s.count > 0);
    const byStatus = statusEntries.map((s) => ({
      ...s,
      percentage: total > 0 ? Math.round((s.count / total) * 100) : 0,
    }));

    return {
      totalRequests: total,
      pendingCount: pending,
      approvedCount: approved,
      rejectedCount: rejected,
      approvalRate,
      averageReviewTimeHours,
      byInstitution,
      topChangedFields,
      requestsByDate,
      byStatus,
    };
  }

  /**
   * Check if user has permission to approve/reject a request
   * Supports both legacy profiles.role and multi-role via user_roles table
   */
  private static async checkApprovalPermission(
    userId: string,
    learnerId: string
  ): Promise<boolean> {
    const supabase = createServiceRoleClient();

    // Get approver profile
    const { data: approver } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', userId)
      .single();

    if (!approver) return false;

    // Get effective roles (profiles.role + user_roles)
    const effectiveRoles = await this.getUserEffectiveRoles(userId);

    // Super admin can approve anything
    if (effectiveRoles.includes('super_admin')) return true;

    // Get learner's institution and department
    const { data: learner } = await supabase
      .from('learners_profiles')
      .select('institution_id, department_id')
      .eq('id', learnerId)
      .single();

    if (!learner) return false;

    // HOD can approve institution-wide
    if (effectiveRoles.includes('hod') && approver.institution_id === learner.institution_id) {
      return true;
    }

    // Staff can approve department-only
    if (effectiveRoles.includes('staff') && approver.department_id === learner.department_id) {
      return true;
    }

    return false;
  }
}
