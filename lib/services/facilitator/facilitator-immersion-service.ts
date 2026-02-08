// ============================================================================
// Facilitator Industry Immersion Service
// Handles CRUD operations for industry immersion records
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  FacilitatorIndustryImmersion,
  FacilitatorListResponse,
  ImmersionFilters,
  CreateImmersionInput,
  UpdateImmersionInput
} from '@/types/facilitator-development';

export class FacilitatorImmersionService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  private static isValidUUID(id: string | undefined | null): boolean {
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || id.trim() === '') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  private static validateId(id: string | undefined | null, fieldName: string = 'ID'): void {
    if (!this.isValidUUID(id)) {
      const actualValue = id === undefined ? 'undefined' : id === null ? 'null' : `"${id}"`;
      console.error(`[FacilitatorImmersion] Invalid ${fieldName}: ${actualValue}`);
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  private static formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      if (e.message) return String(e.message);
      if (e.details) return String(e.details);
      return JSON.stringify(error);
    }
    return String(error);
  }

  /**
   * Get all immersions with filters and pagination
   */
  static async getImmersions(
    filters: ImmersionFilters = {}
  ): Promise<FacilitatorListResponse<FacilitatorIndustryImmersion>> {
    try {
      let query = (this.getSupabase() as any)
        .from('facilitator_industry_immersion')
        .select('*', { count: 'exact' });

      if (filters.development_id) {
        this.validateId(filters.development_id, 'development_id');
        query = query.eq('development_id', filters.development_id);
      }

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters.industry) {
        query = query.ilike('industry', `%${filters.industry}%`);
      }

      if (filters.search) {
        // Search only in non-null fields, handle nulls gracefully
        const searchPattern = `%${filters.search}%`;
        query = query.or(
          `company_name.ilike.${searchPattern},and(industry.not.is.null,industry.ilike.${searchPattern}),and(role_title.not.is.null,role_title.ilike.${searchPattern})`
        );
      }

      const sortBy = filters.sort_by || 'start_date';
      const sortOrder = filters.sort_order === 'asc';
      query = query.order(sortBy, { ascending: sortOrder });

      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      query = query.range(from, from + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('[FacilitatorImmersion] Error fetching immersions:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get all immersions for a specific development record (no pagination)
   */
  static async getImmersionsByDevelopmentId(
    developmentId: string
  ): Promise<FacilitatorIndustryImmersion[]> {
    try {
      this.validateId(developmentId, 'development_id');

      const { data, error } = await (this.getSupabase() as any)
        .from('facilitator_industry_immersion')
        .select('*')
        .eq('development_id', developmentId)
        .order('start_date', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[FacilitatorImmersion] Error fetching immersions:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get single immersion by ID
   */
  static async getImmersionById(id: string): Promise<FacilitatorIndustryImmersion> {
    try {
      this.validateId(id, 'immersion ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('facilitator_industry_immersion')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Immersion record not found');

      return data;
    } catch (error) {
      console.error('[FacilitatorImmersion] Error fetching immersion:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create new immersion
   */
  static async createImmersion(
    input: CreateImmersionInput
  ): Promise<FacilitatorIndustryImmersion> {
    try {
      this.validateId(input.development_id, 'development_id');

      // Validate dates: end_date must be after start_date if provided
      if (input.end_date && input.start_date) {
        const startDate = new Date(input.start_date);
        const endDate = new Date(input.end_date);
        if (endDate < startDate) {
          throw new Error('End date cannot be before start date');
        }
      }

      // Validate duration_days is positive
      if (input.duration_days <= 0) {
        throw new Error('Duration must be greater than 0');
      }

      // Validate rating if provided (should be 1-5)
      if (input.rating !== undefined && input.rating !== null) {
        if (input.rating < 1 || input.rating > 5) {
          throw new Error('Rating must be between 1 and 5');
        }
      }

      const insertData = {
        development_id: input.development_id,
        company_name: input.company_name,
        industry: input.industry || null,
        role_title: input.role_title || null,
        duration_days: input.duration_days,
        start_date: input.start_date,
        end_date: input.end_date || null,
        objectives: input.objectives || [],
        learnings: input.learnings || null,
        skills_acquired: input.skills_acquired || [],
        industry_contacts_made: input.industry_contacts_made || 0,
        relevance_to_curriculum: input.relevance_to_curriculum || null,
        evidence_url: input.evidence_url || null,
        rating: input.rating || null,
        supervisor_name: input.supervisor_name || null,
        supervisor_feedback: input.supervisor_feedback || null,
        status: input.status || 'planned',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('facilitator_industry_immersion')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Industry immersion created successfully');
      return data;
    } catch (error) {
      console.error('[FacilitatorImmersion] Error creating immersion:', this.formatError(error));
      toast.error(`Failed to create immersion: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update immersion
   */
  static async updateImmersion(
    id: string,
    input: UpdateImmersionInput
  ): Promise<FacilitatorIndustryImmersion> {
    try {
      this.validateId(id, 'immersion ID');

      // Validate dates: end_date must be after start_date if both provided
      if (input.end_date && input.start_date) {
        const startDate = new Date(input.start_date);
        const endDate = new Date(input.end_date);
        if (endDate < startDate) {
          throw new Error('End date cannot be before start date');
        }
      }

      // Validate duration_days if provided
      if (input.duration_days !== undefined && input.duration_days <= 0) {
        throw new Error('Duration must be greater than 0');
      }

      // Validate rating if provided
      if (input.rating !== undefined && input.rating !== null) {
        if (input.rating < 1 || input.rating > 5) {
          throw new Error('Rating must be between 1 and 5');
        }
      }

      const updateData = {
        ...input,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('facilitator_industry_immersion')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Immersion updated successfully');
      return data;
    } catch (error) {
      console.error('[FacilitatorImmersion] Error updating immersion:', this.formatError(error));
      toast.error(`Failed to update immersion: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Delete immersion
   */
  static async deleteImmersion(id: string): Promise<void> {
    try {
      this.validateId(id, 'immersion ID');

      const { error } = await (this.getSupabase() as any)
        .from('facilitator_industry_immersion')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Immersion deleted');
    } catch (error) {
      console.error('[FacilitatorImmersion] Error deleting immersion:', this.formatError(error));
      toast.error('Failed to delete immersion');
      throw error;
    }
  }
}
