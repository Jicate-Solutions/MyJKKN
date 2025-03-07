// lib/services/resource/resource-request-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  ResourceRequest,
  CreateResourceRequestDto,
  UpdateResourceRequestDto,
  ResourceRequestFilters,
  ResourceRequestListResponse
} from '@/types/resources';

export class ResourceRequestService {
  private static supabase = createClientComponentClient();

  static async createResourceRequest(
    data: CreateResourceRequestDto
  ): Promise<ResourceRequest> {
    try {
      const { data: request, error } = await this.supabase
        .from('resource_requests')
        .insert({
          requester_id: data.requester_id,
          resource_type: data.resource_type,
          specifications: data.specifications,
          justification: data.justification,
          estimated_cost: data.estimated_cost,
          priority: data.priority,
          status: data.status || 'pending',
          notes: data.notes
        })
        .select('*')
        .single();

      if (error) throw error;
      return request as ResourceRequest;
    } catch (error) {
      console.error('Error creating resource request:', error);
      toast.error('Failed to create resource request');
      throw error;
    }
  }

  static async updateResourceRequest(
    id: string,
    data: UpdateResourceRequestDto
  ): Promise<ResourceRequest> {
    try {
      const { data: request, error } = await this.supabase
        .from('resource_requests')
        .update({
          requester_id: data.requester_id,
          resource_type: data.resource_type,
          specifications: data.specifications,
          justification: data.justification,
          estimated_cost: data.estimated_cost,
          priority: data.priority,
          status: data.status,
          approver_id: data.approver_id,
          approval_date: data.approval_date,
          notes: data.notes
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return request as ResourceRequest;
    } catch (error) {
      console.error('Error updating resource request:', error);
      toast.error('Failed to update resource request');
      throw error;
    }
  }

  static async deleteResourceRequest(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('resource_requests')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting resource request:', error);
      toast.error('Failed to delete resource request');
      throw error;
    }
  }

  static async getResourceRequests(
    filters: ResourceRequestFilters = {}
  ): Promise<ResourceRequestListResponse> {
    try {
      const {
        search,
        requester_id,
        resource_type,
        priority,
        status,
        page = 1,
        limit = 10
      } = filters;

      // Calculate pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Start building the query
      let query = this.supabase.from('resource_requests').select(
        `
          *,
          requester:profiles(id, name, email),
          approver:profiles(id, name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (search) {
        query = query.or(
          `justification.ilike.%${search}%, specifications->>'name'.ilike.%${search}%`
        );
      }

      if (requester_id) {
        query = query.eq('requester_id', requester_id);
      }

      if (resource_type) {
        query = query.eq('resource_type', resource_type);
      }

      if (priority) {
        query = query.eq('priority', priority);
      }

      if (status) {
        query = query.eq('status', status);
      }

      // Apply pagination
      query = query.range(from, to);

      // Execute the query
      const { data, error, count } = await query;

      if (error) throw error;

      // Calculate total pages
      const totalPages = count ? Math.ceil(count / limit) : 0;

      return {
        data: data as ResourceRequest[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching resource requests:', error);
      toast.error('Failed to fetch resource requests');
      throw error;
    }
  }

  static async getResourceRequest(id: string): Promise<ResourceRequest> {
    try {
      const { data, error } = await this.supabase
        .from('resource_requests')
        .select(
          `
          *,
          requester:profiles(id, name, email),
          approver:profiles(id, name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as ResourceRequest;
    } catch (error) {
      console.error('Error fetching resource request:', error);
      toast.error('Failed to fetch resource request details');
      throw error;
    }
  }

  static async getUserResourceRequests(
    userId: string
  ): Promise<ResourceRequest[]> {
    try {
      const { data, error } = await this.supabase
        .from('resource_requests')
        .select(
          `
          *,
          requester:profiles(id, name, email),
          approver:profiles(id, name)
        `
        )
        .eq('requester_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ResourceRequest[];
    } catch (error) {
      console.error('Error fetching user resource requests:', error);
      toast.error('Failed to fetch your resource requests');
      throw error;
    }
  }

  static async approveResourceRequest(
    id: string,
    approverId: string,
    notes?: string
  ): Promise<ResourceRequest> {
    try {
      const { data, error } = await this.supabase
        .from('resource_requests')
        .update({
          status: 'approved',
          approver_id: approverId,
          approval_date: new Date().toISOString().split('T')[0],
          notes: notes
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as ResourceRequest;
    } catch (error) {
      console.error('Error approving resource request:', error);
      toast.error('Failed to approve resource request');
      throw error;
    }
  }

  static async rejectResourceRequest(
    id: string,
    approverId: string,
    notes?: string
  ): Promise<ResourceRequest> {
    try {
      const { data, error } = await this.supabase
        .from('resource_requests')
        .update({
          status: 'rejected',
          approver_id: approverId,
          approval_date: new Date().toISOString().split('T')[0],
          notes: notes
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as ResourceRequest;
    } catch (error) {
      console.error('Error rejecting resource request:', error);
      toast.error('Failed to reject resource request');
      throw error;
    }
  }

  static async markResourceRequestAsAcquired(
    id: string,
    notes?: string
  ): Promise<ResourceRequest> {
    try {
      const { data, error } = await this.supabase
        .from('resource_requests')
        .update({
          status: 'acquired',
          notes: notes
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as ResourceRequest;
    } catch (error) {
      console.error('Error marking resource request as acquired:', error);
      toast.error('Failed to mark resource request as acquired');
      throw error;
    }
  }
}
