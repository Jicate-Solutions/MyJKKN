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
  OutcomeType,
  SalaryRange
} from '@/types/alumni';

// Ordinal mapping for SalaryRange to compute average/median
const SALARY_ORDINALS: Record<string, number> = {
  'below_3l': 1,
  '3l_to_5l': 2,
  '5l_to_8l': 3,
  '8l_to_12l': 4,
  '12l_to_20l': 5,
  '20l_to_35l': 6,
  'above_35l': 7,
};

const ORDINAL_TO_SALARY: SalaryRange[] = [
  'below_3l',   // index 0 -> ordinal 1
  '3l_to_5l',   // index 1 -> ordinal 2
  '5l_to_8l',   // index 2 -> ordinal 3
  '8l_to_12l',  // index 3 -> ordinal 4
  '12l_to_20l', // index 4 -> ordinal 5
  '20l_to_35l', // index 5 -> ordinal 6
  'above_35l',  // index 6 -> ordinal 7
];

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
        .select('*, program:programs!program_id(id, program_name)', { count: 'exact' });

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }
      if (filters.cohort_year) {
        query = query.eq('cohort_year', filters.cohort_year);
      }
      if (filters.cohort_batch_id) {
        query = query.eq('cohort_batch_id', filters.cohort_batch_id);
      }
      if (filters.is_published !== undefined) {
        query = query.eq('is_published', filters.is_published);
      }

      query = query.order('employment_rate', { ascending: false, nullsFirst: false });

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
        .select('*, program:programs!program_id(id, program_name)')
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
        top_employers: input.top_employers || [],
        top_sectors: input.top_sectors || [],
        top_roles: input.top_roles || [],
        top_locations: input.top_locations || [],
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('outcome_program_correlation')
        .upsert(upsertData, {
          onConflict: 'program_id,cohort_year'
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
   * Compute correlation from alumni outcome data for a program + cohort year
   */
  static async computeCorrelation(
    institutionId: string,
    programId: string,
    cohortYear: number
  ): Promise<OutcomeProgramCorrelation> {
    try {
      this.validateId(institutionId, 'institution_id');
      this.validateId(programId, 'program_id');

      // Fetch all outcomes for this program + graduation year
      const { data: outcomes, error } = await (this.getSupabase() as any)
        .from('alumni_outcomes')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('program_id', programId)
        .eq('graduation_year', cohortYear);

      if (error) throw error;

      const all = outcomes || [];
      const total = all.length;

      if (total === 0) {
        // Still save an empty correlation
        return this.upsertCorrelation({
          institution_id: institutionId,
          program_id: programId,
          cohort_year: cohortYear,
          total_graduates: 0
        });
      }

      // Compute stats
      let employedCount = 0;
      let selfEmployedCount = 0;
      let higherStudiesCount = 0;
      let entrepreneurCount = 0;
      let competitiveExamsCount = 0;
      let familyBusinessCount = 0;
      let seekingCount = 0;
      let unknownCount = 0;
      let relevantCount = 0;
      let relevantTotal = 0;
      let satisfactionSum = 0;
      let satisfactionCount = 0;
      let placementDaysSum = 0;
      let placementDaysCount = 0;
      let placementBeforeGradCount = 0;
      let wouldRecommendCount = 0;
      let wouldRecommendTotal = 0;
      let mentorsAvailable = 0;
      let guestLecturersAvailable = 0;
      let potentialRecruiters = 0;
      const employerCounts: Record<string, number> = {};
      const sectorCounts: Record<string, number> = {};
      const roleCounts: Record<string, number> = {};
      const locationCounts: Record<string, number> = {};
      const salaryOrdinals: number[] = [];

      all.forEach((o: any) => {
        // Count by outcome type
        switch (o.outcome_type) {
          case 'employed': employedCount++; break;
          case 'self_employed': selfEmployedCount++; break;
          case 'higher_studies': higherStudiesCount++; break;
          case 'entrepreneur': entrepreneurCount++; break;
          case 'competitive_exams': competitiveExamsCount++; break;
          case 'family_business': familyBusinessCount++; break;
          case 'seeking': seekingCount++; break;
          case 'unknown': unknownCount++; break;
        }

        // Program relevance
        if (o.is_relevant_to_program !== null && o.is_relevant_to_program !== undefined) {
          relevantTotal++;
          if (o.is_relevant_to_program) relevantCount++;
        }

        // Satisfaction
        if (typeof o.satisfaction_score === 'number') {
          satisfactionSum += o.satisfaction_score;
          satisfactionCount++;
        }

        // Would recommend
        if (o.would_recommend_program !== null && o.would_recommend_program !== undefined) {
          wouldRecommendTotal++;
          if (o.would_recommend_program) wouldRecommendCount++;
        }

        // Placement timing (using outcome_start_date vs graduation_date)
        if (o.outcome_start_date && o.graduation_date) {
          const gradDate = new Date(o.graduation_date);
          const startDate = new Date(o.outcome_start_date);
          const daysDiff = Math.round((startDate.getTime() - gradDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff >= 0) {
            placementDaysSum += daysDiff;
            placementDaysCount++;
          }
          if (daysDiff < 0) {
            placementBeforeGradCount++;
          }
        }

        // Employer tracking
        if (o.company_name) {
          employerCounts[o.company_name] = (employerCounts[o.company_name] || 0) + 1;
        }

        // Sector tracking
        if (o.industry_sector) {
          sectorCounts[o.industry_sector] = (sectorCounts[o.industry_sector] || 0) + 1;
        }

        // Role tracking
        if (o.designation) {
          roleCounts[o.designation] = (roleCounts[o.designation] || 0) + 1;
        }

        // Location tracking
        if (o.city) {
          locationCounts[o.city] = (locationCounts[o.city] || 0) + 1;
        }

        // Salary range ordinals (skip not_applicable and undisclosed)
        if (o.salary_range && SALARY_ORDINALS[o.salary_range]) {
          salaryOrdinals.push(SALARY_ORDINALS[o.salary_range]);
        }

        // Engagement
        if (o.is_willing_to_mentor) mentorsAvailable++;
        if (o.is_willing_to_guest_lecture) guestLecturersAvailable++;
        if (o.is_willing_to_hire) potentialRecruiters++;
      });

      // Compute salary ranges
      let averageSalaryRange: SalaryRange | undefined;
      let medianSalaryRange: SalaryRange | undefined;
      if (salaryOrdinals.length > 0) {
        const avgOrdinal = Math.round(salaryOrdinals.reduce((a, b) => a + b, 0) / salaryOrdinals.length);
        averageSalaryRange = ORDINAL_TO_SALARY[Math.max(0, Math.min(avgOrdinal - 1, 6))];

        const sorted = [...salaryOrdinals].sort((a, b) => a - b);
        const medianOrdinal = sorted[Math.floor(sorted.length / 2)];
        medianSalaryRange = ORDINAL_TO_SALARY[Math.max(0, Math.min(medianOrdinal - 1, 6))];
      }

      // Build salary distribution
      const salaryDistribution: Record<string, number> = {};
      all.forEach((o: any) => {
        if (o.salary_range) {
          salaryDistribution[o.salary_range] = (salaryDistribution[o.salary_range] || 0) + 1;
        }
      });

      // Sort and get top employers/sectors/roles/locations
      const topEmployers = Object.entries(employerCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([company, count]) => ({ company, count }));

      const topSectors = Object.entries(sectorCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([sector, count]) => ({
          sector,
          count,
          percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
        }));

      const topRoles = Object.entries(roleCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([role, count]) => ({ role, count }));

      const topLocations = Object.entries(locationCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([city, count]) => ({ city, count }));

      // Compute rates
      const tracked = total;
      const totalEmployed = employedCount + selfEmployedCount;
      const employmentRate = tracked > 0 ? Math.round((totalEmployed / tracked) * 10000) / 100 : undefined;
      const entrepreneurshipRate = tracked > 0 ? Math.round((entrepreneurCount / tracked) * 10000) / 100 : undefined;
      const higherStudiesRate = tracked > 0 ? Math.round((higherStudiesCount / tracked) * 10000) / 100 : undefined;

      return this.upsertCorrelation({
        institution_id: institutionId,
        program_id: programId,
        cohort_year: cohortYear,
        total_graduates: total,
        tracked_graduates: tracked,
        employed_count: employedCount,
        self_employed_count: selfEmployedCount,
        higher_studies_count: higherStudiesCount,
        entrepreneur_count: entrepreneurCount,
        competitive_exams_count: competitiveExamsCount,
        family_business_count: familyBusinessCount,
        seeking_count: seekingCount,
        unknown_count: unknownCount,
        employment_rate: employmentRate,
        entrepreneurship_rate: entrepreneurshipRate,
        higher_studies_rate: higherStudiesRate,
        average_salary_range: averageSalaryRange,
        median_salary_range: medianSalaryRange,
        salary_distribution: Object.keys(salaryDistribution).length > 0 ? salaryDistribution : undefined,
        top_employers: topEmployers.length > 0 ? topEmployers : undefined,
        top_sectors: topSectors.length > 0 ? topSectors : undefined,
        top_roles: topRoles.length > 0 ? topRoles : undefined,
        top_locations: topLocations.length > 0 ? topLocations : undefined,
        avg_relevance_percentage: relevantTotal > 0 ? Math.round((relevantCount / relevantTotal) * 10000) / 100 : undefined,
        program_satisfaction_avg: satisfactionCount > 0 ? Math.round((satisfactionSum / satisfactionCount) * 10) / 10 : undefined,
        would_recommend_percentage: wouldRecommendTotal > 0 ? Math.round((wouldRecommendCount / wouldRecommendTotal) * 10000) / 100 : undefined,
        avg_days_to_placement: placementDaysCount > 0 ? Math.round(placementDaysSum / placementDaysCount) : undefined,
        placement_before_graduation_count: placementBeforeGradCount > 0 ? placementBeforeGradCount : undefined,
        mentors_available: mentorsAvailable > 0 ? mentorsAvailable : undefined,
        guest_lecturers_available: guestLecturersAvailable > 0 ? guestLecturersAvailable : undefined,
        potential_recruiters: potentialRecruiters > 0 ? potentialRecruiters : undefined,
        alumni_engaged_count: (mentorsAvailable + guestLecturersAvailable + potentialRecruiters) > 0
          ? mentorsAvailable + guestLecturersAvailable + potentialRecruiters
          : undefined,
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
