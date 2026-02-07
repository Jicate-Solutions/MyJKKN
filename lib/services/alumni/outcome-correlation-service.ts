// ============================================================================
// Outcome Correlation Service
// Handles program effectiveness tracking and correlation computation
// Phase P4.1 - Accountability
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  OutcomeProgramCorrelation,
  AlumniListResponse,
  OutcomeCorrelationFilters,
  CreateOutcomeCorrelationInput,
  UpdateOutcomeCorrelationInput,
  OutcomeType
} from '@/types/alumni';

export class OutcomeCorrelationService {
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
      console.error(`[OutcomeCorrelation] Invalid ${fieldName}: ${actualValue}`);
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
   * Get all correlations with filters and pagination
   */
  static async getCorrelations(
    filters: OutcomeCorrelationFilters = {}
  ): Promise<AlumniListResponse<OutcomeProgramCorrelation>> {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter');
      }

      let query = (this.getSupabase() as any)
        .from('outcome_program_correlation')
        .select('*, program:programs(id, program_name), department:departments(id, name)', { count: 'exact' });

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }
      if (filters.academic_year) {
        query = query.eq('academic_year', filters.academic_year);
      }

      query = query.order('effectiveness_score', { ascending: false, nullsFirst: false });

      const page = filters.page || 1;
      const limit = filters.limit || 20;
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
      console.error('[OutcomeCorrelation] Error fetching correlations:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get single correlation by ID
   */
  static async getCorrelationById(id: string): Promise<OutcomeProgramCorrelation> {
    try {
      this.validateId(id, 'correlation ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('outcome_program_correlation')
        .select('*, program:programs(id, program_name), department:departments(id, name)')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Correlation not found');

      return data;
    } catch (error) {
      console.error('[OutcomeCorrelation] Error fetching correlation:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create or update correlation record
   */
  static async upsertCorrelation(input: CreateOutcomeCorrelationInput): Promise<OutcomeProgramCorrelation> {
    try {
      this.validateId(input.institution_id, 'institution_id');
      this.validateId(input.program_id, 'program_id');

      const upsertData = {
        ...input,
        top_recruiters: input.top_recruiters || [],
        top_competencies: input.top_competencies || [],
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('outcome_program_correlation')
        .upsert(upsertData, {
          onConflict: 'program_id,academic_year'
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Correlation data saved');
      return data;
    } catch (error) {
      console.error('[OutcomeCorrelation] Error upserting correlation:', this.formatError(error));
      toast.error(`Failed to save correlation: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update correlation record
   */
  static async updateCorrelation(id: string, input: Partial<UpdateOutcomeCorrelationInput>): Promise<OutcomeProgramCorrelation> {
    try {
      this.validateId(id, 'correlation ID');

      const updateData = {
        ...input,
        updated_at: new Date().toISOString()
      };
      delete (updateData as any).id;

      const { data, error } = await (this.getSupabase() as any)
        .from('outcome_program_correlation')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Correlation updated');
      return data;
    } catch (error) {
      console.error('[OutcomeCorrelation] Error updating correlation:', this.formatError(error));
      toast.error(`Failed to update correlation: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Compute correlation from alumni outcome data for a program + academic year
   */
  static async computeCorrelation(
    institutionId: string,
    programId: string,
    academicYear: string
  ): Promise<OutcomeProgramCorrelation> {
    try {
      this.validateId(institutionId, 'institution_id');
      this.validateId(programId, 'program_id');

      // Parse year from academic year string (e.g., '2024-25' -> graduation year 2025)
      const yearParts = academicYear.split('-');
      let graduationYear: number;
      if (yearParts.length === 2) {
        const centuryPrefix = yearParts[0].substring(0, 2);
        graduationYear = parseInt(centuryPrefix + yearParts[1], 10);
      } else {
        graduationYear = parseInt(academicYear, 10);
      }

      // Fetch all outcomes for this program + graduation year
      const { data: outcomes, error } = await (this.getSupabase() as any)
        .from('alumni_outcomes')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('program_id', programId)
        .eq('graduation_year', graduationYear);

      if (error) throw error;

      const all = outcomes || [];
      const total = all.length;

      if (total === 0) {
        // Still save an empty correlation
        return this.upsertCorrelation({
          institution_id: institutionId,
          program_id: programId,
          academic_year: academicYear,
          total_graduates: 0
        });
      }

      // Compute stats
      let placedCount = 0;
      let higherStudiesCount = 0;
      let entrepreneurCount = 0;
      let coreDomainCount = 0;
      let coreDomainTotal = 0;
      let satisfactionSum = 0;
      let satisfactionCount = 0;
      let placementDaysSum = 0;
      let placementDaysCount = 0;
      const recruiterCounts: Record<string, number> = {};
      const competencyCounts: Record<string, number> = {};
      const salaryValues: number[] = [];

      all.forEach((o: any) => {
        if (o.outcome_type === 'employed' || o.outcome_type === 'freelancer') {
          placedCount++;
        }
        if (o.outcome_type === 'higher_studies') higherStudiesCount++;
        if (o.outcome_type === 'entrepreneur') entrepreneurCount++;

        if (o.is_core_domain !== null) {
          coreDomainTotal++;
          if (o.is_core_domain) coreDomainCount++;
        }

        if (typeof o.satisfaction_score === 'number') {
          satisfactionSum += o.satisfaction_score;
          satisfactionCount++;
        }

        if (typeof o.time_to_placement_days === 'number') {
          placementDaysSum += o.time_to_placement_days;
          placementDaysCount++;
        }

        if (o.company_name) {
          recruiterCounts[o.company_name] = (recruiterCounts[o.company_name] || 0) + 1;
        }

        if (o.competencies_utilized && Array.isArray(o.competencies_utilized)) {
          o.competencies_utilized.forEach((c: string) => {
            competencyCounts[c] = (competencyCounts[c] || 0) + 1;
          });
        }

        // Estimate salary from range for average
        if (o.salary_range) {
          const salaryMap: Record<string, number> = {
            'below_3_lpa': 2,
            '3-5 LPA': 4,
            '5-8 LPA': 6.5,
            '8-12 LPA': 10,
            '12+ LPA': 15
          };
          if (salaryMap[o.salary_range]) {
            salaryValues.push(salaryMap[o.salary_range]);
          }
        }
      });

      // Sort and get top recruiters/competencies
      const topRecruiters = Object.entries(recruiterCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name]) => name);

      const topCompetencies = Object.entries(competencyCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name]) => name);

      // Calculate salary stats
      const avgSalary = salaryValues.length > 0
        ? salaryValues.reduce((a, b) => a + b, 0) / salaryValues.length
        : null;
      const sortedSalaries = [...salaryValues].sort((a, b) => a - b);
      const medianSalary = sortedSalaries.length > 0
        ? sortedSalaries[Math.floor(sortedSalaries.length / 2)]
        : null;

      // Calculate effectiveness score (composite)
      // Placement % * 0.3 + Core domain % * 0.2 + Satisfaction * 0.2 + Speed * 0.15 + Higher Studies * 0.15
      const placementPct = total > 0 ? (placedCount / total) * 100 : 0;
      const coreDomainPct = coreDomainTotal > 0 ? (coreDomainCount / coreDomainTotal) * 100 : 0;
      const satisfactionNorm = satisfactionCount > 0 ? ((satisfactionSum / satisfactionCount) / 10) * 100 : 0;
      const speedScore = placementDaysCount > 0
        ? Math.max(0, 100 - (placementDaysSum / placementDaysCount) / 3.65) // 365 days = 0, 0 days = 100
        : 50; // default neutral
      const higherStudiesPct = total > 0 ? (higherStudiesCount / total) * 100 : 0;

      const effectivenessScore =
        placementPct * 0.3 +
        coreDomainPct * 0.2 +
        satisfactionNorm * 0.2 +
        speedScore * 0.15 +
        higherStudiesPct * 0.15;

      return this.upsertCorrelation({
        institution_id: institutionId,
        program_id: programId,
        academic_year: academicYear,
        total_graduates: total,
        placed_count: placedCount,
        higher_studies_count: higherStudiesCount,
        entrepreneur_count: entrepreneurCount,
        average_salary_lpa: avgSalary ? Math.round(avgSalary * 100) / 100 : undefined,
        median_salary_lpa: medianSalary ? Math.round(medianSalary * 100) / 100 : undefined,
        core_domain_percentage: coreDomainTotal > 0 ? Math.round((coreDomainCount / coreDomainTotal) * 10000) / 100 : undefined,
        average_time_to_placement_days: placementDaysCount > 0 ? Math.round(placementDaysSum / placementDaysCount) : undefined,
        top_recruiters: topRecruiters,
        top_competencies: topCompetencies,
        satisfaction_average: satisfactionCount > 0 ? Math.round((satisfactionSum / satisfactionCount) * 10) / 10 : undefined,
        effectiveness_score: Math.round(effectivenessScore * 100) / 100
      });
    } catch (error) {
      console.error('[OutcomeCorrelation] Error computing correlation:', this.formatError(error));
      toast.error(`Failed to compute correlation: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Delete correlation record
   */
  static async deleteCorrelation(id: string): Promise<void> {
    try {
      this.validateId(id, 'correlation ID');

      const { error } = await (this.getSupabase() as any)
        .from('outcome_program_correlation')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Correlation deleted');
    } catch (error) {
      console.error('[OutcomeCorrelation] Error deleting correlation:', this.formatError(error));
      toast.error('Failed to delete correlation');
      throw error;
    }
  }
}
