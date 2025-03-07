// lib/services/resource/sharing-policy-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  SharingPolicy,
  CreateSharingPolicyDto,
  UpdateSharingPolicyDto,
  SharingPolicyFilters,
  SharingPolicyListResponse
} from '@/types/resources';

export class SharingPolicyService {
  private static supabase = createClientComponentClient();

  static async createSharingPolicy(
    data: CreateSharingPolicyDto
  ): Promise<SharingPolicy> {
    try {
      const { data: policy, error } = await this.supabase
        .from('sharing_policies')
        .insert({
          resource_type_id: data.resource_type_id,
          institution_id: data.institution_id,
          priority_levels: data.priority_levels,
          approval_required: data.approval_required,
          max_reservation_duration: data.max_reservation_duration,
          advance_notice_required: data.advance_notice_required,
          cancellation_policy: data.cancellation_policy,
          pricing_model: data.pricing_model,
          is_active: data.is_active ?? true
        })
        .select('*')
        .single();

      if (error) throw error;
      return policy as SharingPolicy;
    } catch (error) {
      console.error('Error creating sharing policy:', error);
      toast.error('Failed to create sharing policy');
      throw error;
    }
  }

  static async updateSharingPolicy(
    id: string,
    data: UpdateSharingPolicyDto
  ): Promise<SharingPolicy> {
    try {
      const { data: policy, error } = await this.supabase
        .from('sharing_policies')
        .update({
          resource_type_id: data.resource_type_id,
          institution_id: data.institution_id,
          priority_levels: data.priority_levels,
          approval_required: data.approval_required,
          max_reservation_duration: data.max_reservation_duration,
          advance_notice_required: data.advance_notice_required,
          cancellation_policy: data.cancellation_policy,
          pricing_model: data.pricing_model,
          is_active: data.is_active
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return policy as SharingPolicy;
    } catch (error) {
      console.error('Error updating sharing policy:', error);
      toast.error('Failed to update sharing policy');
      throw error;
    }
  }

  static async deleteSharingPolicy(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('sharing_policies')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting sharing policy:', error);
      toast.error('Failed to delete sharing policy');
      throw error;
    }
  }

  static async getSharingPolicies(
    filters: SharingPolicyFilters = {}
  ): Promise<SharingPolicyListResponse> {
    try {
      const {
        resource_type_id,
        institution_id,
        approval_required,
        isActive,
        page = 1,
        limit = 10
      } = filters;

      // Calculate pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Start building the query
      let query = this.supabase.from('sharing_policies').select(
        `
          *,
          resource_type:resource_categories(id, category_name),
          institution:institutions(id, name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (resource_type_id) {
        query = query.eq('resource_type_id', resource_type_id);
      }

      if (institution_id) {
        query = query.eq('institution_id', institution_id);
      }

      if (approval_required !== undefined) {
        query = query.eq('approval_required', approval_required);
      }

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      // Apply pagination
      query = query.range(from, to);

      // Execute the query
      const { data, error, count } = await query;

      if (error) throw error;

      // Calculate total pages
      const totalPages = count ? Math.ceil(count / limit) : 0;

      return {
        data: data as SharingPolicy[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching sharing policies:', error);
      toast.error('Failed to fetch sharing policies');
      throw error;
    }
  }

  static async getSharingPolicy(id: string): Promise<SharingPolicy> {
    try {
      const { data, error } = await this.supabase
        .from('sharing_policies')
        .select(
          `
          *,
          resource_type:resource_categories(id, category_name),
          institution:institutions(id, name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as SharingPolicy;
    } catch (error) {
      console.error('Error fetching sharing policy:', error);
      toast.error('Failed to fetch sharing policy details');
      throw error;
    }
  }

  static async getApplicableSharingPolicy(
    resourceTypeId: string,
    institutionId: string
  ): Promise<SharingPolicy | null> {
    try {
      // First try to find an institution-specific policy
      const { data: institutionPolicy, error: institutionError } =
        await this.supabase
          .from('sharing_policies')
          .select(
            `
          *,
          resource_type:resource_categories(id, category_name),
          institution:institutions(id, name)
        `
          )
          .eq('resource_type_id', resourceTypeId)
          .eq('institution_id', institutionId)
          .eq('is_active', true)
          .maybeSingle();

      if (institutionError) throw institutionError;

      if (institutionPolicy) {
        return institutionPolicy as SharingPolicy;
      }

      // If no institution-specific policy, try to find a global policy
      const { data: globalPolicy, error: globalError } = await this.supabase
        .from('sharing_policies')
        .select(
          `
          *,
          resource_type:resource_categories(id, category_name)
        `
        )
        .eq('resource_type_id', resourceTypeId)
        .is('institution_id', null)
        .eq('is_active', true)
        .maybeSingle();

      if (globalError) throw globalError;

      return (globalPolicy as SharingPolicy) || null;
    } catch (error) {
      console.error('Error fetching applicable sharing policy:', error);
      toast.error('Failed to fetch sharing policy');
      throw error;
    }
  }
}
