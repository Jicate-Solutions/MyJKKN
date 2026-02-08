// ============================================================================
// Facilitator Development Service
// Handles CRUD operations for facilitator development records
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  FacilitatorDevelopment,
  FacilitatorListResponse,
  FacilitatorDevelopmentFilters,
  CreateFacilitatorDevelopmentInput,
  UpdateFacilitatorDevelopmentInput,
  FacilitatorDevelopmentStats,
  DevelopmentStage,
  DevelopmentStatus
} from '@/types/facilitator-development';

export class FacilitatorDevelopmentService {
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
      console.error(`[FacilitatorDev] Invalid ${fieldName}: ${actualValue}`);
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
   * Get all development records with filters and pagination
   */
  static async getDevelopmentRecords(
    filters: FacilitatorDevelopmentFilters = {}
  ): Promise<FacilitatorListResponse<FacilitatorDevelopment>> {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter');
      }

      let query = (this.getSupabase() as any)
        .from('facilitator_development')
        .select('*', { count: 'exact' });

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.staff_id) {
        query = query.eq('staff_id', filters.staff_id);
      }

      if (filters.current_stage) {
        if (Array.isArray(filters.current_stage)) {
          query = query.in('current_stage', filters.current_stage);
        } else {
          query = query.eq('current_stage', filters.current_stage);
        }
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.mentor_id) {
        query = query.eq('mentor_id', filters.mentor_id);
      }

      if (filters.search) {
        query = query.or(
          `staff_id.ilike.%${filters.search}%,mentor_notes.ilike.%${filters.search}%`
        );
      }

      const sortBy = filters.sort_by || 'created_at';
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
      console.error('[FacilitatorDev] Error fetching records:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get single development record by ID with immersions
   */
  static async getDevelopmentById(id: string): Promise<FacilitatorDevelopment> {
    try {
      this.validateId(id, 'development ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('facilitator_development')
        .select(`
          *,
          immersions:facilitator_industry_immersion(*)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Development record not found');

      return data;
    } catch (error) {
      console.error('[FacilitatorDev] Error fetching record:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create new development record
   */
  static async createDevelopment(
    input: CreateFacilitatorDevelopmentInput
  ): Promise<FacilitatorDevelopment> {
    try {
      this.validateId(input.institution_id, 'institution_id');
      this.validateId(input.staff_id, 'staff_id');
      if (input.mentor_id) this.validateId(input.mentor_id, 'mentor_id');

      const insertData = {
        institution_id: input.institution_id,
        staff_id: input.staff_id,
        current_stage: input.current_stage || 'teacher',
        target_stage: input.target_stage || 'facilitator',
        development_plan: input.development_plan || {},
        competencies_acquired: input.competencies_acquired || [],
        certifications: input.certifications || [],
        mentor_id: input.mentor_id || null,
        mentor_notes: input.mentor_notes || null,
        status: input.status || 'active',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('facilitator_development')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Development plan created successfully');
      return data;
    } catch (error) {
      console.error('[FacilitatorDev] Error creating record:', this.formatError(error));
      toast.error(`Failed to create development plan: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update development record
   */
  static async updateDevelopment(
    id: string,
    input: UpdateFacilitatorDevelopmentInput
  ): Promise<FacilitatorDevelopment> {
    try {
      this.validateId(id, 'development ID');
      if (input.mentor_id !== undefined && input.mentor_id !== null) {
        this.validateId(input.mentor_id, 'mentor_id');
      }

      // If stage is being changed, update stage_updated_at
      const updateData: Record<string, unknown> = {
        ...input,
        updated_at: new Date().toISOString()
      };

      if (input.current_stage) {
        updateData.stage_updated_at = new Date().toISOString();
      }

      if (input.status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('facilitator_development')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Development plan updated successfully');
      return data;
    } catch (error) {
      console.error('[FacilitatorDev] Error updating record:', this.formatError(error));
      toast.error(`Failed to update development plan: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Delete development record
   */
  static async deleteDevelopment(id: string): Promise<void> {
    try {
      this.validateId(id, 'development ID');

      const { error } = await (this.getSupabase() as any)
        .from('facilitator_development')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Development plan deleted');
    } catch (error) {
      console.error('[FacilitatorDev] Error deleting record:', this.formatError(error));
      toast.error('Failed to delete development plan');
      throw error;
    }
  }

  /**
   * Get development statistics for institution dashboard
   */
  static async getDevelopmentStats(institutionId: string): Promise<FacilitatorDevelopmentStats> {
    try {
      this.validateId(institutionId, 'institution_id');

      const { data: records, error } = await (this.getSupabase() as any)
        .from('facilitator_development')
        .select('id, current_stage, status, outcome_score, industry_exposure_hours, workshops_attended, peer_observations_done, peer_observations_received, workshops_facilitated')
        .eq('institution_id', institutionId);

      if (error) throw error;

      const all = records || [];

      // Initialize stats
      const stats: FacilitatorDevelopmentStats = {
        total_records: all.length,
        by_stage: {
          teacher: 0,
          transitioning: 0,
          facilitator: 0,
          master_facilitator: 0
        },
        by_status: {
          active: 0,
          paused: 0,
          completed: 0
        },
        active_count: 0,
        completed_count: 0,
        avg_outcome_score: 0,
        total_immersions: 0,
        total_industry_hours: 0,
        avg_workshops_attended: 0,
        avg_peer_observations: 0
      };

      if (all.length === 0) return stats;

      let totalScore = 0;
      let scoreCount = 0;
      let totalWorkshops = 0;
      let totalObservations = 0;
      let totalHours = 0;

      all.forEach((r: any) => {
        // Count by stage
        const stage = r.current_stage as DevelopmentStage;
        if (stats.by_stage[stage] !== undefined) {
          stats.by_stage[stage]++;
        }

        // Count by status
        const status = r.status as DevelopmentStatus;
        if (stats.by_status[status] !== undefined) {
          stats.by_status[status]++;
        }

        if (r.status === 'active') stats.active_count++;
        if (r.status === 'completed') stats.completed_count++;

        if (r.outcome_score !== null && r.outcome_score !== undefined) {
          totalScore += Number(r.outcome_score);
          scoreCount++;
        }

        totalWorkshops += r.workshops_attended || 0;
        totalObservations += (r.peer_observations_done || 0) + (r.peer_observations_received || 0);
        totalHours += r.industry_exposure_hours || 0;
      });

      stats.avg_outcome_score = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0;
      stats.total_industry_hours = totalHours;
      stats.avg_workshops_attended = all.length > 0 ? Math.round((totalWorkshops / all.length) * 10) / 10 : 0;
      stats.avg_peer_observations = all.length > 0 ? Math.round((totalObservations / all.length) * 10) / 10 : 0;

      // Count immersions
      const devIds = all.map((r: any) => r.id);
      if (devIds.length > 0) {
        const { count: immersionCount } = await (this.getSupabase() as any)
          .from('facilitator_industry_immersion')
          .select('id', { count: 'exact', head: true })
          .in('development_id', devIds);

        stats.total_immersions = immersionCount || 0;
      }

      return stats;
    } catch (error) {
      console.error('[FacilitatorDev] Error fetching stats:', this.formatError(error));
      throw error;
    }
  }
}
