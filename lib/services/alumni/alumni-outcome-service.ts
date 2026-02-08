// ============================================================================
// Alumni Outcome Service
// Handles CRUD operations for individual alumni outcome records
// Phase P4.1 - Accountability
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  AlumniOutcome,
  AlumniListResponse,
  AlumniOutcomeFilters,
  CreateAlumniOutcomeInput,
  UpdateAlumniOutcomeInput,
  AlumniDashboardStats,
  OutcomeType,
  SalaryRange,
  VerificationStatus
} from '@/types/alumni';

export class AlumniOutcomeService {
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
      console.error(`[Alumni] Invalid ${fieldName}: ${actualValue}`);
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
   * Get all alumni outcomes with filters and pagination
   */
  static async getOutcomes(
    filters: AlumniOutcomeFilters = {}
  ): Promise<AlumniListResponse<AlumniOutcome>> {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter');
      }

      let query = (this.getSupabase() as any)
        .from('alumni_outcomes')
        .select('*, program:programs(id, program_name), learner:learners(id, first_name, last_name)', { count: 'exact' });

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters.outcome_type) {
        query = query.eq('outcome_type', filters.outcome_type);
      }
      if (filters.graduation_year) {
        query = query.eq('graduation_year', filters.graduation_year);
      }
      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }
      if (filters.batch_id) {
        query = query.eq('batch_id', filters.batch_id);
      }
      if (filters.verification_status) {
        query = query.eq('verification_status', filters.verification_status);
      }
      if (filters.is_relevant_to_program !== undefined) {
        query = query.eq('is_relevant_to_program', filters.is_relevant_to_program);
      }
      if (filters.city) {
        query = query.eq('city', filters.city);
      }
      if (filters.state) {
        query = query.eq('state', filters.state);
      }
      if (filters.country) {
        query = query.eq('country', filters.country);
      }
      if (filters.salary_range) {
        query = query.eq('salary_range', filters.salary_range);
      }
      if (filters.search) {
        query = query.or(
          `company_name.ilike.%${filters.search}%,designation.ilike.%${filters.search}%,industry_sector.ilike.%${filters.search}%`
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
      console.error('[Alumni] Error fetching outcomes:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get single alumni outcome by ID
   */
  static async getOutcomeById(id: string): Promise<AlumniOutcome> {
    try {
      this.validateId(id, 'outcome ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('alumni_outcomes')
        .select('*, program:programs(id, program_name), learner:learners(id, first_name, last_name)')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Alumni outcome not found');

      return data;
    } catch (error) {
      console.error('[Alumni] Error fetching outcome:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create new alumni outcome
   */
  static async createOutcome(input: CreateAlumniOutcomeInput): Promise<AlumniOutcome> {
    try {
      this.validateId(input.institution_id, 'institution_id');

      const insertData = {
        ...input,
        skills_used: input.skills_used || [],
        data_source: input.data_source || 'self_reported',
        verification_status: input.verification_status || 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('alumni_outcomes')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Alumni outcome recorded successfully');
      return data;
    } catch (error) {
      console.error('[Alumni] Error creating outcome:', this.formatError(error));
      toast.error(`Failed to create alumni outcome: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update alumni outcome
   */
  static async updateOutcome(id: string, input: Partial<UpdateAlumniOutcomeInput>): Promise<AlumniOutcome> {
    try {
      this.validateId(id, 'outcome ID');

      const updateData = {
        ...input,
        updated_at: new Date().toISOString()
      };
      // Remove id from update data
      delete (updateData as any).id;

      const { data, error } = await (this.getSupabase() as any)
        .from('alumni_outcomes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Alumni outcome updated successfully');
      return data;
    } catch (error) {
      console.error('[Alumni] Error updating outcome:', this.formatError(error));
      toast.error(`Failed to update alumni outcome: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Delete alumni outcome
   */
  static async deleteOutcome(id: string): Promise<void> {
    try {
      this.validateId(id, 'outcome ID');

      const { error } = await (this.getSupabase() as any)
        .from('alumni_outcomes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Alumni outcome deleted');
    } catch (error) {
      console.error('[Alumni] Error deleting outcome:', this.formatError(error));
      toast.error('Failed to delete alumni outcome');
      throw error;
    }
  }

  /**
   * Verify alumni outcome (set verification_status to document_verified)
   */
  static async verifyOutcome(id: string, verifiedBy: string): Promise<AlumniOutcome> {
    try {
      this.validateId(id, 'outcome ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('alumni_outcomes')
        .update({
          verification_status: 'document_verified' as VerificationStatus,
          verified_by: verifiedBy,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Alumni outcome verified');
      return data;
    } catch (error) {
      console.error('[Alumni] Error verifying outcome:', this.formatError(error));
      toast.error('Failed to verify alumni outcome');
      throw error;
    }
  }

  /**
   * Get dashboard statistics for institution
   */
  static async getDashboardStats(institutionId: string): Promise<AlumniDashboardStats> {
    try {
      this.validateId(institutionId, 'institution_id');

      const { data: outcomes, error } = await (this.getSupabase() as any)
        .from('alumni_outcomes')
        .select('outcome_type, salary_range, is_relevant_to_program, satisfaction_score, verification_status, city, is_willing_to_mentor, is_willing_to_hire, is_willing_to_guest_lecture')
        .eq('institution_id', institutionId);

      if (error) throw error;

      const all = outcomes || [];
      const total = all.length;

      // Count by outcome type (all 9 types)
      const byType: Record<OutcomeType, number> = {
        employed: 0,
        self_employed: 0,
        entrepreneur: 0,
        higher_studies: 0,
        competitive_exams: 0,
        family_business: 0,
        gap_year: 0,
        seeking: 0,
        unknown: 0
      };
      const bySalary: Record<string, number> = {} as Record<SalaryRange, number>;
      const byCity: Record<string, number> = {};
      let relevantCount = 0;
      let relevantTotal = 0;
      let satisfactionSum = 0;
      let satisfactionCount = 0;
      let verifiedCount = 0;
      let pendingCount = 0;
      let willingToMentor = 0;
      let willingToHire = 0;
      let willingToGuestLecture = 0;

      all.forEach((o: any) => {
        if (o.outcome_type && byType[o.outcome_type as OutcomeType] !== undefined) {
          byType[o.outcome_type as OutcomeType]++;
        }
        if (o.salary_range) {
          bySalary[o.salary_range] = (bySalary[o.salary_range] || 0) + 1;
        }
        if (o.city) {
          byCity[o.city] = (byCity[o.city] || 0) + 1;
        }
        if (o.is_relevant_to_program !== null && o.is_relevant_to_program !== undefined) {
          relevantTotal++;
          if (o.is_relevant_to_program) relevantCount++;
        }
        if (typeof o.satisfaction_score === 'number') {
          satisfactionSum += o.satisfaction_score;
          satisfactionCount++;
        }
        if (o.verification_status === 'pending') {
          pendingCount++;
        } else {
          verifiedCount++;
        }
        if (o.is_willing_to_mentor) willingToMentor++;
        if (o.is_willing_to_hire) willingToHire++;
        if (o.is_willing_to_guest_lecture) willingToGuestLecture++;
      });

      const employedCount = byType.employed + byType.self_employed;

      return {
        total_tracked: total,
        by_outcome_type: byType,
        employment_percentage: total > 0 ? Math.round((employedCount / total) * 100) : 0,
        higher_studies_percentage: total > 0 ? Math.round((byType.higher_studies / total) * 100) : 0,
        entrepreneur_percentage: total > 0 ? Math.round((byType.entrepreneur / total) * 100) : 0,
        avg_relevance_percentage: relevantTotal > 0 ? Math.round((relevantCount / relevantTotal) * 100) : 0,
        average_satisfaction: satisfactionCount > 0 ? Math.round((satisfactionSum / satisfactionCount) * 10) / 10 : 0,
        verified_count: verifiedCount,
        pending_count: pendingCount,
        by_salary_range: bySalary as Record<SalaryRange, number>,
        by_city: byCity,
        engagement_stats: {
          willing_to_mentor: willingToMentor,
          willing_to_hire: willingToHire,
          willing_to_guest_lecture: willingToGuestLecture
        }
      };
    } catch (error) {
      console.error('[Alumni] Error fetching dashboard stats:', this.formatError(error));
      throw error;
    }
  }
}
