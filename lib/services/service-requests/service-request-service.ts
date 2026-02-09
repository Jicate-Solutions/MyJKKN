/**
 * Service Request Service
 *
 * Core service for creating, updating, and querying service requests.
 * Handles form submission, status transitions, pagination, and analytics.
 *
 * @module services/service-requests/service-request-service
 * @created 2026-02-09
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  ServiceRequest,
  ServiceRequestStatus,
  CreateServiceRequestDto,
  UpdateServiceRequestDto,
  ServiceRequestFilters,
  ServiceRequestListResponse,
  ServiceRequestAnalytics,
} from '@/types/service-request';
import { ServiceRequestTimelineService } from './service-request-timeline-service';

const getSupabase = async () => await createServerSupabaseClient() as any;

// Select string for request queries with common joins
const REQUEST_SELECT = `
  *,
  service_type:service_types(id, name, slug, icon, color),
  requester:profiles!requester_id(id, full_name, email, avatar_url),
  institution:institutions(id, name)
`;

const REQUEST_DETAIL_SELECT = `
  *,
  service_type:service_types(
    *,
    fields:service_type_fields(*),
    approval_steps:service_request_approval_steps(*)
  ),
  requester:profiles!requester_id(id, full_name, email, avatar_url),
  institution:institutions(id, name),
  approvals:service_request_approvals(
    *,
    approver:profiles!approver_id(id, full_name, email)
  ),
  timeline:service_request_timeline(
    *,
    actor:profiles!actor_id(id, full_name, email, avatar_url)
  ),
  attachments:service_request_attachments(*)
`;

export class ServiceRequestService {
  /**
   * Create a new service request
   *
   * Steps:
   * 1. Validate service type exists and user's role is allowed
   * 2. Check max_active_requests limit
   * 3. Generate request_number
   * 4. Get requester profile for requester_context
   * 5. Insert the request
   */
  static async createRequest(
    dto: CreateServiceRequestDto,
    userId: string
  ): Promise<ServiceRequest> {
    const supabase = await getSupabase();

    // 1. Get service type to validate
    const { data: serviceType, error: typeError } = await supabase
      .from('service_types')
      .select('*, approval_steps:service_request_approval_steps(*)')
      .eq('id', dto.service_type_id)
      .single();

    if (typeError || !serviceType) {
      throw new Error('Service type not found');
    }

    if (!serviceType.is_active) {
      throw new Error('This service type is currently unavailable');
    }

    // Check allowed roles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, role, institution_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('User profile not found');
    }

    if (
      serviceType.allowed_roles &&
      serviceType.allowed_roles.length > 0 &&
      !serviceType.allowed_roles.includes(profile.role) &&
      profile.role !== 'super_admin'
    ) {
      throw new Error('You are not allowed to create this type of request');
    }

    // 2. Check max active requests
    if (serviceType.max_active_requests > 0) {
      const { count, error: countError } = await supabase
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .eq('requester_id', userId)
        .eq('service_type_id', dto.service_type_id)
        .in('status', ['draft', 'submitted', 'in_review', 'approved']);

      if (countError) {
        console.error('[service-requests] Failed to count active requests:', countError);
      }

      if (count !== null && count >= serviceType.max_active_requests) {
        throw new Error(
          `You already have ${count} active request(s) of this type. Maximum allowed: ${serviceType.max_active_requests}`
        );
      }
    }

    // 3. Generate request number via RPC (or fallback)
    let requestNumber: string;
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'generate_service_request_number',
        { p_service_type_slug: serviceType.slug }
      );

      if (rpcError || !rpcResult) {
        // Fallback: generate a simple request number
        const timestamp = Date.now().toString(36).toUpperCase();
        requestNumber = `SR-${serviceType.slug.toUpperCase().slice(0, 4)}-${timestamp}`;
      } else {
        requestNumber = rpcResult;
      }
    } catch {
      const timestamp = Date.now().toString(36).toUpperCase();
      requestNumber = `SR-${serviceType.slug.toUpperCase().slice(0, 4)}-${timestamp}`;
    }

    // 4. Build requester context
    let requesterContext: Record<string, any> = {
      role: profile.role,
      email: profile.email,
    };

    // Get institution info if available
    if (profile.institution_id) {
      const { data: institution } = await supabase
        .from('institutions')
        .select('id, name')
        .eq('id', profile.institution_id)
        .single();

      if (institution) {
        requesterContext.institution_name = institution.name;
      }
    }

    // If student, get academic context
    if (profile.role === 'student') {
      const { data: learner } = await supabase
        .from('learners_profiles')
        .select(`
          id,
          section:sections!section_id(
            id, section_name,
            degree:degrees!degree_id(id, degree_name),
            semester:semesters!semester_id(id, semester_name)
          ),
          department:departments!department_id(id, department_name)
        `)
        .eq('college_email', profile.email)
        .maybeSingle();

      if (learner) {
        const section = learner.section as any;
        const dept = learner.department as any;
        if (section) {
          requesterContext.section = section.section_name;
          if (section.degree) requesterContext.program = section.degree.degree_name;
          if (section.semester) requesterContext.semester = section.semester.semester_name;
        }
        if (dept) {
          requesterContext.department = dept.department_name;
        }
      }
    }

    // Determine initial status
    const initialStatus = dto.status || 'submitted';

    // 5. Insert the request
    const { data: request, error: insertError } = await supabase
      .from('service_requests')
      .insert({
        request_number: requestNumber,
        service_type_id: dto.service_type_id,
        requester_id: userId,
        institution_id: profile.institution_id,
        status: initialStatus,
        priority: dto.priority || null,
        current_approval_step: initialStatus === 'submitted' ? 1 : 0,
        form_data: dto.form_data,
        requester_context: requesterContext,
        submitted_at: initialStatus === 'submitted' ? new Date().toISOString() : null,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[service-requests] Failed to create request:', insertError);
      throw new Error(`Failed to create request: ${insertError.message}`);
    }

    // Add timeline entry
    await ServiceRequestTimelineService.addStatusChange(
      request.id,
      userId,
      'draft' as ServiceRequestStatus,
      initialStatus as ServiceRequestStatus,
      'Request created'
    );

    // If submitted, create first approval record
    if (initialStatus === 'submitted' && serviceType.approval_steps?.length > 0) {
      const firstStep = serviceType.approval_steps
        .sort((a: any, b: any) => a.step_order - b.step_order)[0];

      await supabase.from('service_request_approvals').insert({
        service_request_id: request.id,
        approval_step_id: firstStep.id,
        step_order: firstStep.step_order,
        approver_id: userId, // Placeholder - will be resolved by role
        action: 'pending',
      });
    }

    return request;
  }

  /**
   * Update a request (only allowed when status is draft or returned)
   */
  static async updateRequest(
    id: string,
    dto: UpdateServiceRequestDto,
    userId: string
  ): Promise<ServiceRequest> {
    const supabase = await getSupabase();

    // Verify the request exists and is editable
    const { data: existing, error: fetchError } = await supabase
      .from('service_requests')
      .select('id, status, requester_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new Error('Service request not found');
    }

    if (!['draft', 'returned'].includes(existing.status)) {
      throw new Error('Request can only be edited when in draft or returned status');
    }

    if (existing.requester_id !== userId) {
      throw new Error('You can only edit your own requests');
    }

    const updateData: Record<string, any> = { updated_by: userId };
    if (dto.form_data) updateData.form_data = dto.form_data;
    if (dto.priority) updateData.priority = dto.priority;

    const { data, error } = await supabase
      .from('service_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[service-requests] Failed to update request:', error);
      throw new Error(`Failed to update request: ${error.message}`);
    }

    await ServiceRequestTimelineService.addTimelineEntry(id, {
      actor_id: userId,
      event_type: 'edit',
      content: 'Request details updated',
    });

    return data;
  }

  /**
   * Submit a draft or returned request for approval
   */
  static async submitRequest(
    id: string,
    userId: string
  ): Promise<ServiceRequest> {
    const supabase = await getSupabase();

    const { data: request, error: fetchError } = await supabase
      .from('service_requests')
      .select('*, service_type:service_types(*, approval_steps:service_request_approval_steps(*))')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      throw new Error('Service request not found');
    }

    if (!['draft', 'returned'].includes(request.status)) {
      throw new Error('Only draft or returned requests can be submitted');
    }

    const oldStatus = request.status;

    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        current_approval_step: 1,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[service-requests] Failed to submit request:', error);
      throw new Error(`Failed to submit request: ${error.message}`);
    }

    // Create first pending approval record
    const approvalSteps = request.service_type?.approval_steps || [];
    if (approvalSteps.length > 0) {
      const firstStep = approvalSteps.sort(
        (a: any, b: any) => a.step_order - b.step_order
      )[0];

      await supabase.from('service_request_approvals').insert({
        service_request_id: id,
        approval_step_id: firstStep.id,
        step_order: firstStep.step_order,
        approver_id: userId, // Placeholder
        action: 'pending',
      });
    }

    await ServiceRequestTimelineService.addStatusChange(
      id,
      userId,
      oldStatus,
      'submitted',
      'Request submitted for approval'
    );

    return data;
  }

  /**
   * Cancel a request
   */
  static async cancelRequest(
    id: string,
    userId: string,
    reason: string
  ): Promise<ServiceRequest> {
    const supabase = await getSupabase();

    const { data: existing, error: fetchError } = await supabase
      .from('service_requests')
      .select('id, status, requester_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new Error('Service request not found');
    }

    if (!['draft', 'submitted', 'returned'].includes(existing.status)) {
      throw new Error('This request cannot be cancelled in its current status');
    }

    const oldStatus = existing.status;

    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[service-requests] Failed to cancel request:', error);
      throw new Error(`Failed to cancel request: ${error.message}`);
    }

    await ServiceRequestTimelineService.addStatusChange(
      id,
      userId,
      oldStatus,
      'cancelled',
      `Request cancelled: ${reason}`
    );

    return data;
  }

  /**
   * Get a single request with full details (all joins)
   */
  static async getRequest(id: string): Promise<ServiceRequest> {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from('service_requests')
      .select(REQUEST_DETAIL_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[service-requests] Failed to fetch request:', error);
      throw new Error(`Service request not found: ${error.message}`);
    }

    return data;
  }

  /**
   * Get paginated requests for the current user
   */
  static async getMyRequests(
    userId: string,
    filters: ServiceRequestFilters
  ): Promise<ServiceRequestListResponse> {
    const supabase = await getSupabase();

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('service_requests')
      .select(REQUEST_SELECT, { count: 'exact' })
      .eq('requester_id', userId);

    query = this.applyFilters(query, filters);

    const sortBy = filters?.sortBy || 'created_at';
    const sortOrder = filters?.sortOrder === 'asc';
    query = query.order(sortBy, { ascending: sortOrder }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[service-requests] Failed to fetch my requests:', error);
      throw new Error(`Failed to fetch requests: ${error.message}`);
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
   * Get paginated requests (admin view - all requests)
   */
  static async getAllRequests(
    filters: ServiceRequestFilters
  ): Promise<ServiceRequestListResponse> {
    const supabase = await getSupabase();

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('service_requests')
      .select(REQUEST_SELECT, { count: 'exact' });

    query = this.applyFilters(query, filters);

    const sortBy = filters?.sortBy || 'created_at';
    const sortOrder = filters?.sortOrder === 'asc';
    query = query.order(sortBy, { ascending: sortOrder }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[service-requests] Failed to fetch all requests:', error);
      throw new Error(`Failed to fetch requests: ${error.message}`);
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
   * Get requests pending approval for a given role
   */
  static async getPendingApprovalRequests(
    userRole: string,
    filters?: ServiceRequestFilters
  ): Promise<ServiceRequestListResponse> {
    const supabase = await getSupabase();

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // First get approval step IDs where this role is the approver
    const { data: matchingSteps, error: stepsError } = await supabase
      .from('service_request_approval_steps')
      .select('step_order, service_type_id')
      .eq('approver_role', userRole);

    if (stepsError || !matchingSteps || matchingSteps.length === 0) {
      return {
        data: [],
        metadata: { total: 0, page, limit, totalPages: 0 },
      };
    }

    // Build filter: requests in submitted/in_review where current_approval_step
    // matches a step for this role's service type
    const serviceTypeIds = [...new Set(matchingSteps.map((s: any) => s.service_type_id))];
    const stepOrders = [...new Set(matchingSteps.map((s: any) => s.step_order))];

    let query = supabase
      .from('service_requests')
      .select(REQUEST_SELECT, { count: 'exact' })
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
      console.error('[service-requests] Failed to fetch pending approval requests:', error);
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
   * Mark an approved request as fulfilled
   */
  static async markFulfilled(
    id: string,
    userId: string
  ): Promise<ServiceRequest> {
    const supabase = await getSupabase();

    const { data: existing, error: fetchError } = await supabase
      .from('service_requests')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new Error('Service request not found');
    }

    if (existing.status !== 'approved') {
      throw new Error('Only approved requests can be marked as fulfilled');
    }

    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: 'fulfilled',
        fulfilled_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[service-requests] Failed to mark request as fulfilled:', error);
      throw new Error(`Failed to fulfill request: ${error.message}`);
    }

    await ServiceRequestTimelineService.addStatusChange(
      id,
      userId,
      'approved',
      'fulfilled',
      'Request has been fulfilled'
    );

    return data;
  }

  /**
   * Close a fulfilled or approved request
   */
  static async closeRequest(
    id: string,
    userId: string
  ): Promise<ServiceRequest> {
    const supabase = await getSupabase();

    const { data: existing, error: fetchError } = await supabase
      .from('service_requests')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new Error('Service request not found');
    }

    if (!['fulfilled', 'approved'].includes(existing.status)) {
      throw new Error('Only fulfilled or approved requests can be closed');
    }

    const oldStatus = existing.status;

    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[service-requests] Failed to close request:', error);
      throw new Error(`Failed to close request: ${error.message}`);
    }

    await ServiceRequestTimelineService.addStatusChange(
      id,
      userId,
      oldStatus,
      'closed',
      'Request closed'
    );

    return data;
  }

  /**
   * Get request counts grouped by status
   */
  static async getRequestCountsByStatus(filters?: {
    institution_id?: string;
    service_type_id?: string;
  }): Promise<Record<string, number>> {
    const supabase = await getSupabase();

    const statuses: ServiceRequestStatus[] = [
      'draft', 'submitted', 'in_review', 'approved',
      'rejected', 'returned', 'fulfilled', 'closed', 'cancelled',
    ];

    const counts: Record<string, number> = {};

    // Run count queries in parallel
    const promises = statuses.map(async (status) => {
      let query = supabase
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);

      if (filters?.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters?.service_type_id) {
        query = query.eq('service_type_id', filters.service_type_id);
      }

      const { count } = await query;
      counts[status] = count || 0;
    });

    await Promise.all(promises);

    return counts;
  }

  /**
   * Get analytics data for dashboard
   */
  static async getAnalytics(filters?: {
    institution_id?: string;
    service_type_id?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<ServiceRequestAnalytics> {
    const supabase = await getSupabase();

    // Get status counts
    const byStatus = await this.getRequestCountsByStatus({
      institution_id: filters?.institution_id,
      service_type_id: filters?.service_type_id,
    });

    const totalRequests = Object.values(byStatus).reduce((sum, c) => sum + c, 0);

    // Get counts by service type
    let typeQuery = supabase
      .from('service_requests')
      .select('service_type_id, service_type:service_types(id, name)');

    if (filters?.institution_id) {
      typeQuery = typeQuery.eq('institution_id', filters.institution_id);
    }

    const { data: typeData } = await typeQuery;

    const byServiceType: Record<string, { type_id: string; type_name: string; count: number }> = {};
    (typeData || []).forEach((row: any) => {
      const typeId = row.service_type_id;
      if (!byServiceType[typeId]) {
        byServiceType[typeId] = {
          type_id: typeId,
          type_name: row.service_type?.name || 'Unknown',
          count: 0,
        };
      }
      byServiceType[typeId].count++;
    });

    // Priority counts
    const byPriority: Record<string, number> = { low: 0, normal: 0, high: 0, urgent: 0 };
    const priorityList = ['low', 'normal', 'high', 'urgent'];
    const priorityPromises = priorityList.map(async (p) => {
      let q = supabase
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .eq('priority', p);
      if (filters?.institution_id) q = q.eq('institution_id', filters.institution_id);
      const { count } = await q;
      byPriority[p] = count || 0;
    });
    await Promise.all(priorityPromises);

    return {
      overview: {
        total_requests: totalRequests,
        by_status: byStatus as any,
        by_priority: byPriority as any,
        by_service_type: Object.values(byServiceType),
        avg_approval_time_hours: 0, // TODO: calculate from timestamps
        avg_fulfillment_time_hours: 0,
      },
      trends: [], // TODO: implement trend aggregation
      approval_bottlenecks: [], // TODO: implement bottleneck detection
    };
  }

  /**
   * Apply common filters to a query builder
   */
  private static applyFilters(query: any, filters?: ServiceRequestFilters): any {
    if (!filters) return query;

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status);
      } else {
        query = query.eq('status', filters.status);
      }
    }

    if (filters.service_type_id) {
      query = query.eq('service_type_id', filters.service_type_id);
    }

    if (filters.priority) {
      query = query.eq('priority', filters.priority);
    }

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    if (filters.requester_id) {
      query = query.eq('requester_id', filters.requester_id);
    }

    if (filters.submitted_from) {
      query = query.gte('submitted_at', filters.submitted_from);
    }

    if (filters.submitted_to) {
      query = query.lte('submitted_at', filters.submitted_to);
    }

    if (filters.search) {
      query = query.ilike('request_number', `%${filters.search}%`);
    }

    return query;
  }
}
