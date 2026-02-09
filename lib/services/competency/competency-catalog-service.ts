// ============================================================================
// Competency Catalog Service
// Handles CRUD operations for the master competency catalog
// Supports Fink's Taxonomy for measuring significant learning dimensions
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Competency,
  CompetencyListResponse,
  CompetencyFilters,
  CreateCompetencyDTO,
  UpdateCompetencyDTO,
  CompetencyStats,
  CompetencyPickerOption,
  BulkImportCompetencyRow,
  BulkImportResult
} from '@/types/competency';
import type { FinksDimensions } from '@/types/competency';
import {
  calculateFinkAggregate,
  getFinksDimensionGaps,
  getFinksDimensionStrengths
} from '@/lib/services/learners/learner-profile-service';

export class CompetencyCatalogService {
  // Get fresh client for each request to ensure auth token is current
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Validate UUID format to prevent "invalid input syntax for type uuid" errors
   */
  private static isValidUUID(id: string | undefined | null): boolean {
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || id.trim() === '') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  /**
   * Validate ID and throw descriptive error if invalid
   */
  private static validateId(id: string | undefined | null, fieldName: string = 'ID'): void {
    if (!this.isValidUUID(id)) {
      const actualValue = id === undefined ? 'undefined' : id === null ? 'null' : `"${id}"`;
      console.error(`[Competency] Invalid ${fieldName}: ${actualValue}`);
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  /**
   * Format error for logging
   */
  private static formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      if (e.message) return String(e.message);
      if (e.details) return String(e.details);
      if (e.hint) return String(e.hint);
      return JSON.stringify(error);
    }
    return String(error);
  }

  /**
   * Get all competencies with filters and pagination
   */
  static async getCompetencies(
    filters: CompetencyFilters = {}
  ): Promise<CompetencyListResponse<Competency>> {
    try {
      // Validate institution_id if provided
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter');
      }

      let query = (this.getSupabase() as any)
        .from('competency_catalog')
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.competency_type) {
        if (Array.isArray(filters.competency_type)) {
          query = query.in('competency_type', filters.competency_type);
        } else {
          query = query.eq('competency_type', filters.competency_type);
        }
      }

      if (filters.industry_tags && filters.industry_tags.length > 0) {
        query = query.overlaps('industry_tags', filters.industry_tags);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.search) {
        const safeSearch = filters.search.replace(/[%_\\]/g, '\\$&');
        query = query.or(
          `competency_code.ilike.%${safeSearch}%,competency_name.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`
        );
      }

      // Sorting
      const sortBy = filters.sort_by || 'created_at';
      const sortOrder = filters.sort_order === 'asc';
      query = query.order(sortBy, { ascending: sortOrder });

      // Pagination
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
      console.error('[Competency] Error fetching competencies:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get single competency by ID with related mappings
   */
  static async getCompetencyById(id: string): Promise<Competency> {
    try {
      this.validateId(id, 'competency ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .select(`
          *,
          program_mappings:competency_program_mapping(
            id,
            program_id,
            required_level,
            weight_percentage,
            semester_expected,
            is_mandatory,
            created_at,
            program:programs(id, program_name)
          ),
          course_mappings:course_competency_mapping(
            id,
            course_id,
            contribution_level,
            learning_hours,
            assessment_method,
            created_at,
            course:courses(id, course_code, course_name)
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error('Competency not found');
      }

      return data;
    } catch (error) {
      console.error('[Competency] Error fetching competency:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Validate Fink's dimensions if provided (0-100 range)
   */
  private static validateFinksDimensions(dimensions: Partial<FinksDimensions> | undefined): void {
    if (!dimensions) return;

    const validDimensions = [
      'foundational_knowledge',
      'application',
      'integration',
      'human_dimension',
      'caring',
      'learning_to_learn'
    ];

    for (const [key, value] of Object.entries(dimensions)) {
      if (!validDimensions.includes(key)) {
        throw new Error(`Invalid Fink's dimension: ${key}`);
      }
      if (typeof value !== 'number' || value < 0 || value > 100) {
        throw new Error(`Fink's dimension ${key} must be between 0 and 100, got ${value}`);
      }
    }
  }

  /**
   * Create new competency
   * Supports optional Fink's dimensions for assessment mapping
   */
  static async createCompetency(input: CreateCompetencyDTO & { finks_dimensions?: Partial<FinksDimensions> }): Promise<Competency> {
    try {
      this.validateId(input.institution_id, 'institution_id');
      this.validateFinksDimensions(input.finks_dimensions);

      // Check for duplicate competency code within institution
      const { data: existing } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .select('id')
        .eq('institution_id', input.institution_id)
        .eq('competency_code', input.competency_code)
        .maybeSingle();

      if (existing) {
        throw new Error(`Competency code "${input.competency_code}" already exists in this institution`);
      }

      const insertData: any = {
        ...input,
        is_active: input.is_active ?? true,
        industry_tags: input.industry_tags || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Add finks_dimensions if provided
      if (input.finks_dimensions) {
        insertData.finks_dimensions = input.finks_dimensions;
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Competency created successfully');
      return data;
    } catch (error) {
      console.error('[Competency] Error creating competency:', this.formatError(error));
      toast.error(`Failed to create competency: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update competency
   * Supports updating Fink's dimensions
   */
  static async updateCompetency(id: string, input: UpdateCompetencyDTO & { finks_dimensions?: Partial<FinksDimensions> }): Promise<Competency> {
    try {
      this.validateId(id, 'competency ID');
      this.validateFinksDimensions(input.finks_dimensions);

      // If updating competency_code, check for duplicates
      if (input.competency_code) {
        const { data: current } = await (this.getSupabase() as any)
          .from('competency_catalog')
          .select('institution_id, competency_code')
          .eq('id', id)
          .single();

        if (current && input.competency_code !== current.competency_code) {
          const { data: existing } = await (this.getSupabase() as any)
            .from('competency_catalog')
            .select('id')
            .eq('institution_id', current.institution_id)
            .eq('competency_code', input.competency_code)
            .neq('id', id)
            .maybeSingle();

          if (existing) {
            throw new Error(`Competency code "${input.competency_code}" already exists in this institution`);
          }
        }
      }

      const updateData: any = {
        ...input,
        updated_at: new Date().toISOString()
      };

      // Merge finks_dimensions if provided
      if (input.finks_dimensions) {
        const { data: current } = await (this.getSupabase() as any)
          .from('competency_catalog')
          .select('finks_dimensions')
          .eq('id', id)
          .single();

        updateData.finks_dimensions = {
          ...(current?.finks_dimensions || {}),
          ...input.finks_dimensions
        };
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Competency updated successfully');
      return data;
    } catch (error) {
      console.error('[Competency] Error updating competency:', this.formatError(error));
      toast.error(`Failed to update competency: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Soft delete competency (set is_active to false)
   */
  static async archiveCompetency(id: string): Promise<void> {
    try {
      this.validateId(id, 'competency ID');

      const { error } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Competency archived successfully');
    } catch (error) {
      console.error('[Competency] Error archiving competency:', this.formatError(error));
      toast.error('Failed to archive competency');
      throw error;
    }
  }

  /**
   * Restore archived competency
   */
  static async restoreCompetency(id: string): Promise<void> {
    try {
      this.validateId(id, 'competency ID');

      const { error } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .update({
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Competency restored successfully');
    } catch (error) {
      console.error('[Competency] Error restoring competency:', this.formatError(error));
      toast.error('Failed to restore competency');
      throw error;
    }
  }

  /**
   * Get competency statistics for institution
   */
  static async getCompetencyStats(institutionId: string): Promise<CompetencyStats> {
    try {
      this.validateId(institutionId, 'institution_id');

      // Get all competencies for the institution
      // CRITICAL: Include 'id' to enable .in() queries below
      const { data: competencies, error: compError } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .select('id, competency_type, is_active, finks_dimensions')
        .eq('institution_id', institutionId);

      if (compError) {
        console.error('[Competency] Error fetching competencies:', this.formatError(compError));
        throw compError;
      }

      // Initialize default counts
      let programMappedCount = 0;
      let courseMappedCount = 0;

      // Only query mappings if there are competencies
      // CRITICAL: Supabase .in() with empty array causes errors
      if (competencies && competencies.length > 0) {
        const competencyIds = competencies.map((c: any) => c.id);

        // Get mapped counts for programs
        const { count: pmCount, error: pmError } = await (this.getSupabase() as any)
          .from('competency_program_mapping')
          .select('competency_id', { count: 'exact', head: true })
          .in('competency_id', competencyIds);

        if (pmError) {
          console.error('[Competency] Error fetching program mappings:', this.formatError(pmError));
          // Don't throw - just log warning and continue with 0 count
          console.warn('[Competency] Continuing with 0 program mappings due to error');
        } else {
          programMappedCount = pmCount || 0;
        }

        // Get mapped counts for courses
        const { count: cmCount, error: cmError } = await (this.getSupabase() as any)
          .from('course_competency_mapping')
          .select('competency_id', { count: 'exact', head: true })
          .in('competency_id', competencyIds);

        if (cmError) {
          console.error('[Competency] Error fetching course mappings:', this.formatError(cmError));
          // Don't throw - just log warning and continue with 0 count
          console.warn('[Competency] Continuing with 0 course mappings due to error');
        } else {
          courseMappedCount = cmCount || 0;
        }
      }

      // Initialize dimension accumulators
      const dimensionTotals = {
        foundational_knowledge: 0,
        application: 0,
        integration: 0,
        human_dimension: 0,
        caring: 0,
        learning_to_learn: 0
      };

      const dimensionCounts: Record<keyof typeof dimensionTotals, number> = {
        foundational_knowledge: 0,
        application: 0,
        integration: 0,
        human_dimension: 0,
        caring: 0,
        learning_to_learn: 0
      };

      // Calculate stats
      const stats: CompetencyStats = {
        total_competencies: competencies?.length || 0,
        by_type: {
          technical: 0,
          behavioral: 0,
          domain: 0,
          soft_skill: 0,
          metacognitive: 0
        },
        programs_mapped: programMappedCount || 0,
        courses_mapped: courseMappedCount || 0,
        active_count: 0,
        inactive_count: 0,
        average_ai_resistance: 0,
        avg_finks_dimensions: {
          foundational_knowledge: 0,
          application: 0,
          integration: 0,
          human_dimension: 0,
          caring: 0,
          learning_to_learn: 0
        },
        by_dominant_finks_dimension: {
          foundational_knowledge: 0,
          application: 0,
          integration: 0,
          human_dimension: 0,
          caring: 0,
          learning_to_learn: 0
        }
      };

      (competencies || []).forEach((c: any) => {
        if (c.competency_type && stats.by_type[c.competency_type as keyof typeof stats.by_type] !== undefined) {
          stats.by_type[c.competency_type as keyof typeof stats.by_type]++;
        }
        if (c.is_active) {
          stats.active_count++;
        } else {
          stats.inactive_count++;
        }

        // Aggregate Fink's dimensions
        if (c.finks_dimensions) {
          Object.keys(dimensionTotals).forEach(key => {
            const dimKey = key as keyof typeof dimensionTotals;
            if (typeof c.finks_dimensions[dimKey] === 'number') {
              dimensionTotals[dimKey] += c.finks_dimensions[dimKey];
              dimensionCounts[dimKey]++;
            }
          });

          // Find dominant dimension
          const dimensions = c.finks_dimensions;
          let maxDim: keyof typeof dimensionTotals = 'foundational_knowledge';
          let maxValue = 0;
          Object.keys(dimensions).forEach(key => {
            const dimKey = key as keyof typeof dimensionTotals;
            if (dimensions[dimKey] > maxValue) {
              maxValue = dimensions[dimKey];
              maxDim = dimKey;
            }
          });
          if (maxValue > 0) {
            stats.by_dominant_finks_dimension[maxDim]++;
          }
        }
      });

      // Calculate averages
      Object.keys(dimensionTotals).forEach(key => {
        const dimKey = key as keyof typeof dimensionTotals;
        if (dimensionCounts[dimKey] > 0) {
          stats.avg_finks_dimensions[dimKey] = Math.round(dimensionTotals[dimKey] / dimensionCounts[dimKey]);
        }
      });

      return stats;
    } catch (error) {
      console.error('[Competency] Error fetching stats:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get competency options for picker (simplified list for forms)
   */
  static async getCompetencyOptions(institutionId: string): Promise<CompetencyPickerOption[]> {
    try {
      this.validateId(institutionId, 'institution_id');

      const { data, error } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .select('id, competency_code, competency_name, competency_type, industry_tags')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('competency_name', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[Competency] Error fetching options:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Bulk import competencies from array
   */
  static async bulkImport(
    institutionId: string,
    rows: BulkImportCompetencyRow[]
  ): Promise<BulkImportResult> {
    this.validateId(institutionId, 'institution_id');

    const result: BulkImportResult = {
      total: rows.length,
      success: 0,
      failed: 0,
      errors: []
    };

    // Get existing codes to check for duplicates
    const { data: existing } = await (this.getSupabase() as any)
      .from('competency_catalog')
      .select('competency_code')
      .eq('institution_id', institutionId);

    const existingCodes = new Set((existing || []).map((e: any) => e.competency_code.toLowerCase()));

    const validRows: CreateCompetencyDTO[] = [];

    // Validate rows
    rows.forEach((row, index) => {
      const rowNum = index + 1;

      if (!row.competency_code) {
        result.errors.push({ row: rowNum, code: row.competency_code || '', message: 'Competency code is required' });
        result.failed++;
        return;
      }

      if (!row.competency_name) {
        result.errors.push({ row: rowNum, code: row.competency_code, message: 'Competency name is required' });
        result.failed++;
        return;
      }

      if (existingCodes.has(row.competency_code.toLowerCase())) {
        result.errors.push({ row: rowNum, code: row.competency_code, message: 'Competency code already exists' });
        result.failed++;
        return;
      }

      // Parse industry tags if string
      const industryTags = typeof row.industry_tags === 'string'
        ? row.industry_tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      validRows.push({
        institution_id: institutionId,
        competency_code: row.competency_code,
        competency_name: row.competency_name,
        competency_type: row.competency_type,
        description: row.description,
        industry_tags: industryTags,
        proficiency_levels: [
          { level: 'novice', description: 'Basic awareness', criteria: [] },
          { level: 'beginner', description: 'Basic knowledge', criteria: [] },
          { level: 'intermediate', description: 'Working knowledge', criteria: [] },
          { level: 'advanced', description: 'Deep knowledge', criteria: [] },
          { level: 'expert', description: 'Mastery', criteria: [] }
        ],
        finks_dimensions: {
          foundational_knowledge: 20,
          application: 30,
          integration: 25,
          human_dimension: 10,
          caring: 8,
          learning_to_learn: 7
        }
      });
    });

    // Bulk insert valid rows
    if (validRows.length > 0) {
      const { data, error } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .insert(validRows.map(row => ({
          ...row,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })))
        .select();

      if (error) {
        console.error('[Competency] Bulk insert error:', this.formatError(error));
        result.failed += validRows.length;
        result.errors.push({ row: 0, code: 'BULK', message: `Bulk insert failed: ${this.formatError(error)}` });
      } else {
        result.success = data?.length || 0;
      }
    }

    if (result.success > 0) {
      toast.success(`Imported ${result.success} competencies`);
    }
    if (result.failed > 0) {
      toast.error(`${result.failed} competencies failed to import`);
    }

    return result;
  }

  // ============================================================================
  // FINK'S TAXONOMY HELPER METHODS
  // ============================================================================

  /**
   * Get competency's Fink's dimensions
   */
  static async getCompetencyFinksDimensions(competencyId: string): Promise<Partial<FinksDimensions>> {
    try {
      this.validateId(competencyId, 'competency_id');

      const { data, error } = await (this.getSupabase() as any)
        .from('competency_catalog')
        .select('finks_dimensions')
        .eq('id', competencyId)
        .single();

      if (error) throw error;

      return data?.finks_dimensions || {};
    } catch (error) {
      console.error('[Competency] Error fetching Fink\'s dimensions:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Calculate aggregate Fink's score for a competency
   */
  static async calculateCompetencyFinkAggregate(
    competencyId: string,
    weights?: Partial<FinksDimensions>
  ): Promise<number> {
    try {
      const dimensions = await this.getCompetencyFinksDimensions(competencyId);
      return calculateFinkAggregate(dimensions, weights);
    } catch (error) {
      console.error('[Competency] Error calculating aggregate:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get competency dimension gaps (areas needing definition)
   */
  static async getCompetencyDimensionGaps(
    competencyId: string,
    threshold: number = 70
  ): Promise<Array<{ dimension: keyof FinksDimensions; score: number; gap: number }>> {
    try {
      const dimensions = await this.getCompetencyFinksDimensions(competencyId);
      return getFinksDimensionGaps(dimensions, threshold);
    } catch (error) {
      console.error('[Competency] Error getting gaps:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get competency dimension strengths
   */
  static async getCompetencyDimensionStrengths(
    competencyId: string,
    threshold: number = 85
  ): Promise<Array<{ dimension: keyof FinksDimensions; score: number }>> {
    try {
      const dimensions = await this.getCompetencyFinksDimensions(competencyId);
      return getFinksDimensionStrengths(dimensions, threshold);
    } catch (error) {
      console.error('[Competency] Error getting strengths:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Batch update Fink's dimensions for multiple competencies
   * Useful when mapping competencies to Fink's taxonomy
   */
  static async batchUpdateCompetencyFinksDimensions(
    updates: Array<{
      competency_id: string;
      dimensions: Partial<FinksDimensions>;
    }>
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const update of updates) {
      try {
        await this.updateCompetency(update.competency_id, {
          finks_dimensions: update.dimensions
        } as any);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`${update.competency_id}: ${this.formatError(error)}`);
      }
    }

    if (result.success > 0) {
      toast.success(`Updated ${result.success} competency dimension profiles`);
    }
    if (result.failed > 0) {
      toast.error(`Failed to update ${result.failed} competencies`);
    }

    return result;
  }
}
