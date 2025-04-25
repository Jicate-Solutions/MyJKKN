import {
  createClientSupabaseClient,
  createAdminClient
} from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  DigitalSharingPolicy,
  CreateDigitalSharingPolicyDto,
  UpdateDigitalSharingPolicyDto,
  DigitalSharingPolicyFilters,
  DigitalSharingPolicyListResponse
} from '@/types/digital-resources';

export class DigitalSharingPolicyService {
  private static supabase = createClientSupabaseClient();
  private static adminClient = createAdminClient();

  static async createDigitalSharingPolicy(
    data: CreateDigitalSharingPolicyDto
  ): Promise<DigitalSharingPolicy> {
    try {
      const { data: policy, error } = await this.adminClient
        .from('digital_sharing_policies')
        .insert({
          category_id: data.category_id,
          institution_id: data.institution_id,
          approval_required: data.approval_required,
          max_concurrent_users: data.max_concurrent_users,
          advance_notice_required: data.advance_notice_required,
          pricing_model: data.pricing_model,
          access_window: data.access_window,
          is_active: data.is_active ?? true
        })
        .select('*')
        .single();

      if (error) throw error;
      return policy as DigitalSharingPolicy;
    } catch (error) {
      console.error('Error creating digital sharing policy:', error);
      toast.error('Failed to create digital sharing policy');
      throw error;
    }
  }

  static async updateDigitalSharingPolicy(
    id: string,
    data: UpdateDigitalSharingPolicyDto
  ): Promise<DigitalSharingPolicy> {
    try {
      const { data: policy, error } = await this.adminClient
        .from('digital_sharing_policies')
        .update({
          category_id: data.category_id,
          institution_id: data.institution_id,
          approval_required: data.approval_required,
          max_concurrent_users: data.max_concurrent_users,
          advance_notice_required: data.advance_notice_required,
          pricing_model: data.pricing_model,
          access_window: data.access_window,
          is_active: data.is_active
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return policy as DigitalSharingPolicy;
    } catch (error) {
      console.error('Error updating digital sharing policy:', error);
      toast.error('Failed to update digital sharing policy');
      throw error;
    }
  }

  static async deleteDigitalSharingPolicy(id: string): Promise<void> {
    try {
      const { error } = await this.adminClient
        .from('digital_sharing_policies')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting digital sharing policy:', error);
      toast.error('Failed to delete digital sharing policy');
      throw error;
    }
  }

  static async getDigitalSharingPolicies(
    filters: DigitalSharingPolicyFilters = {}
  ): Promise<DigitalSharingPolicyListResponse> {
    try {
      const {
        category_id,
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
      let query = this.adminClient.from('digital_sharing_policies').select(
        `
          *,
          category:digital_resource_categories(id, category_name),
          institution:institutions(id, name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (category_id) {
        query = query.eq('category_id', category_id);
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
        data: data as DigitalSharingPolicy[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching digital sharing policies:', error);
      toast.error('Failed to fetch digital sharing policies');
      throw error;
    }
  }

  static async getDigitalSharingPolicy(
    id: string
  ): Promise<DigitalSharingPolicy> {
    try {
      const { data, error } = await this.adminClient
        .from('digital_sharing_policies')
        .select(
          `
          *,
          category:digital_resource_categories(id, category_name),
          institution:institutions(id, name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as DigitalSharingPolicy;
    } catch (error) {
      console.error('Error fetching digital sharing policy:', error);
      toast.error('Failed to fetch digital sharing policy details');
      throw error;
    }
  }

  static async getApplicableDigitalSharingPolicy(
    categoryId: string,
    institutionId: string
  ): Promise<DigitalSharingPolicy | null> {
    try {
      // First try to find an institution-specific policy
      const { data: institutionPolicy, error: institutionError } =
        await this.adminClient
          .from('digital_sharing_policies')
          .select(
            `
            *,
            category:digital_resource_categories(id, category_name),
            institution:institutions(id, name)
          `
          )
          .eq('category_id', categoryId)
          .eq('institution_id', institutionId)
          .eq('is_active', true)
          .maybeSingle();

      if (institutionError) throw institutionError;

      if (institutionPolicy) {
        return institutionPolicy as DigitalSharingPolicy;
      }

      // If no institution-specific policy, try to find a global policy
      const { data: globalPolicy, error: globalError } = await this.adminClient
        .from('digital_sharing_policies')
        .select(
          `
          *,
          category:digital_resource_categories(id, category_name)
        `
        )
        .eq('category_id', categoryId)
        .is('institution_id', null)
        .eq('is_active', true)
        .maybeSingle();

      if (globalError) throw globalError;

      return (globalPolicy as DigitalSharingPolicy) || null;
    } catch (error) {
      console.error('Error fetching applicable digital sharing policy:', error);
      toast.error('Failed to fetch digital sharing policy');
      throw error;
    }
  }
}
