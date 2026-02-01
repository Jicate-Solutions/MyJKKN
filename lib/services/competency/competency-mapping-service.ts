// ============================================================================
// Competency Mapping Service
// Handles competency-to-program and competency-to-course mappings
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  CompetencyProgramMapping,
  CompetencyCourseMapping,
  CompetencyListResponse,
  CompetencyProgramMappingFilters,
  CompetencyCourseMappingFilters,
  CreateCompetencyProgramMappingDTO,
  UpdateCompetencyProgramMappingDTO,
  CreateCompetencyCourseMappingDTO,
  UpdateCompetencyCourseMappingDTO,
  ProgramCompetencyCoverage,
  CourseCompetencyContribution
} from '@/types/competency';

export class CompetencyMappingService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Validate UUID format
   */
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
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  private static formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      if (e.message) return String(e.message);
      return JSON.stringify(error);
    }
    return String(error);
  }

  // ============================================================================
  // PROGRAM MAPPINGS
  // ============================================================================

  /**
   * Get competency-program mappings with filters
   */
  static async getProgramMappings(
    filters: CompetencyProgramMappingFilters = {}
  ): Promise<CompetencyListResponse<CompetencyProgramMapping>> {
    try {
      if (filters.program_id) this.validateId(filters.program_id, 'program_id');
      if (filters.competency_id) this.validateId(filters.competency_id, 'competency_id');

      let query = (this.getSupabase() as any)
        .from('competency_program_mapping')
        .select(`
          *,
          competency:competency_catalog(id, competency_code, competency_name, competency_type),
          program:programs(id, program_name)
        `, { count: 'exact' });

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }
      if (filters.competency_id) {
        query = query.eq('competency_id', filters.competency_id);
      }
      if (filters.required_level) {
        query = query.eq('required_level', filters.required_level);
      }
      if (filters.is_mandatory !== undefined) {
        query = query.eq('is_mandatory', filters.is_mandatory);
      }
      if (filters.semester_expected) {
        query = query.eq('semester_expected', filters.semester_expected);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const from = (page - 1) * limit;
      query = query
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

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
      console.error('[CompetencyMapping] Error fetching program mappings:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create program mapping
   */
  static async createProgramMapping(
    input: CreateCompetencyProgramMappingDTO
  ): Promise<CompetencyProgramMapping> {
    try {
      this.validateId(input.competency_id, 'competency_id');
      this.validateId(input.program_id, 'program_id');

      // Check for existing mapping
      const { data: existing } = await (this.getSupabase() as any)
        .from('competency_program_mapping')
        .select('id')
        .eq('competency_id', input.competency_id)
        .eq('program_id', input.program_id)
        .maybeSingle();

      if (existing) {
        throw new Error('This competency is already mapped to this program');
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('competency_program_mapping')
        .insert([{
          ...input,
          is_mandatory: input.is_mandatory ?? true,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Competency mapped to program successfully');
      return data;
    } catch (error) {
      console.error('[CompetencyMapping] Error creating program mapping:', this.formatError(error));
      toast.error(`Failed to map competency: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update program mapping
   */
  static async updateProgramMapping(
    id: string,
    input: UpdateCompetencyProgramMappingDTO
  ): Promise<CompetencyProgramMapping> {
    try {
      this.validateId(id, 'mapping ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('competency_program_mapping')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Mapping updated successfully');
      return data;
    } catch (error) {
      console.error('[CompetencyMapping] Error updating program mapping:', this.formatError(error));
      toast.error('Failed to update mapping');
      throw error;
    }
  }

  /**
   * Delete program mapping
   */
  static async deleteProgramMapping(id: string): Promise<void> {
    try {
      this.validateId(id, 'mapping ID');

      const { error } = await (this.getSupabase() as any)
        .from('competency_program_mapping')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Mapping removed successfully');
    } catch (error) {
      console.error('[CompetencyMapping] Error deleting program mapping:', this.formatError(error));
      toast.error('Failed to remove mapping');
      throw error;
    }
  }

  /**
   * Get program competency coverage analysis
   */
  static async getProgramCoverage(programId: string): Promise<ProgramCompetencyCoverage> {
    try {
      this.validateId(programId, 'program_id');

      // Get program info
      const { data: program, error: progError } = await (this.getSupabase() as any)
        .from('programs')
        .select('id, program_name')
        .eq('id', programId)
        .single();

      if (progError) throw progError;

      // Get required competencies for program
      const { data: mappings, error: mapError } = await (this.getSupabase() as any)
        .from('competency_program_mapping')
        .select(`
          competency_id,
          required_level,
          competency:competency_catalog(id, competency_name)
        `)
        .eq('program_id', programId);

      if (mapError) throw mapError;

      // Get courses in the program and their competency coverage
      const { data: programCourses, error: courseError } = await (this.getSupabase() as any)
        .from('course_mappings')
        .select('course_id')
        .eq('program_id', programId);

      if (courseError) throw courseError;

      const courseIds = (programCourses || []).map((c: any) => c.course_id);

      // Get competency coverage from courses
      const { data: courseMappings, error: cmError } = await (this.getSupabase() as any)
        .from('course_competency_mapping')
        .select('competency_id, course_id')
        .in('course_id', courseIds);

      if (cmError) throw cmError;

      const courseCompetencyMap = new Map<string, number>();
      (courseMappings || []).forEach((cm: any) => {
        courseCompetencyMap.set(
          cm.competency_id,
          (courseCompetencyMap.get(cm.competency_id) || 0) + 1
        );
      });

      const gaps = (mappings || [])
        .filter((m: any) => !courseCompetencyMap.has(m.competency_id) || courseCompetencyMap.get(m.competency_id) === 0)
        .map((m: any) => ({
          competency_id: m.competency_id,
          competency_name: m.competency?.competency_name || '',
          required_level: m.required_level,
          course_coverage: courseCompetencyMap.get(m.competency_id) || 0
        }));

      const mappedCount = (mappings || []).filter((m: any) => courseCompetencyMap.has(m.competency_id)).length;

      return {
        program_id: program.id,
        program_name: program.program_name,
        required_competencies: mappings?.length || 0,
        mapped_to_courses: mappedCount,
        coverage_percentage: mappings?.length ? (mappedCount / mappings.length) * 100 : 0,
        gaps
      };
    } catch (error) {
      console.error('[CompetencyMapping] Error calculating coverage:', this.formatError(error));
      throw error;
    }
  }

  // ============================================================================
  // COURSE MAPPINGS
  // ============================================================================

  /**
   * Get competency-course mappings with filters
   */
  static async getCourseMappings(
    filters: CompetencyCourseMappingFilters = {}
  ): Promise<CompetencyListResponse<CompetencyCourseMapping>> {
    try {
      if (filters.course_id) this.validateId(filters.course_id, 'course_id');
      if (filters.competency_id) this.validateId(filters.competency_id, 'competency_id');

      let query = (this.getSupabase() as any)
        .from('course_competency_mapping')
        .select(`
          *,
          competency:competency_catalog(id, competency_code, competency_name, competency_type),
          course:courses(id, course_code, course_name)
        `, { count: 'exact' });

      if (filters.course_id) {
        query = query.eq('course_id', filters.course_id);
      }
      if (filters.competency_id) {
        query = query.eq('competency_id', filters.competency_id);
      }
      if (filters.contribution_level) {
        query = query.eq('contribution_level', filters.contribution_level);
      }
      if (filters.assessment_method) {
        query = query.eq('assessment_method', filters.assessment_method);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const from = (page - 1) * limit;
      query = query
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

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
      console.error('[CompetencyMapping] Error fetching course mappings:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create course mapping
   */
  static async createCourseMapping(
    input: CreateCompetencyCourseMappingDTO
  ): Promise<CompetencyCourseMapping> {
    try {
      this.validateId(input.competency_id, 'competency_id');
      this.validateId(input.course_id, 'course_id');

      // Check for existing mapping
      const { data: existing } = await (this.getSupabase() as any)
        .from('course_competency_mapping')
        .select('id')
        .eq('competency_id', input.competency_id)
        .eq('course_id', input.course_id)
        .maybeSingle();

      if (existing) {
        throw new Error('This competency is already mapped to this course');
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('course_competency_mapping')
        .insert([{
          ...input,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Competency mapped to course successfully');
      return data;
    } catch (error) {
      console.error('[CompetencyMapping] Error creating course mapping:', this.formatError(error));
      toast.error(`Failed to map competency: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update course mapping
   */
  static async updateCourseMapping(
    id: string,
    input: UpdateCompetencyCourseMappingDTO
  ): Promise<CompetencyCourseMapping> {
    try {
      this.validateId(id, 'mapping ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('course_competency_mapping')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Mapping updated successfully');
      return data;
    } catch (error) {
      console.error('[CompetencyMapping] Error updating course mapping:', this.formatError(error));
      toast.error('Failed to update mapping');
      throw error;
    }
  }

  /**
   * Delete course mapping
   */
  static async deleteCourseMapping(id: string): Promise<void> {
    try {
      this.validateId(id, 'mapping ID');

      const { error } = await (this.getSupabase() as any)
        .from('course_competency_mapping')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Mapping removed successfully');
    } catch (error) {
      console.error('[CompetencyMapping] Error deleting course mapping:', this.formatError(error));
      toast.error('Failed to remove mapping');
      throw error;
    }
  }

  /**
   * Get course competency contribution summary
   */
  static async getCourseContribution(courseId: string): Promise<CourseCompetencyContribution> {
    try {
      this.validateId(courseId, 'course_id');

      // Get course info
      const { data: course, error: courseError } = await (this.getSupabase() as any)
        .from('courses')
        .select('id, course_name')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;

      // Get competency mappings
      const { data: mappings, error: mapError } = await (this.getSupabase() as any)
        .from('course_competency_mapping')
        .select(`
          competency_id,
          contribution_level,
          learning_hours,
          assessment_method,
          competency:competency_catalog(id, competency_name)
        `)
        .eq('course_id', courseId);

      if (mapError) throw mapError;

      const totalHours = (mappings || []).reduce((sum: number, m: any) => sum + (m.learning_hours || 0), 0);

      return {
        course_id: course.id,
        course_name: course.course_name,
        total_competencies: mappings?.length || 0,
        total_learning_hours: totalHours,
        competencies: (mappings || []).map((m: any) => ({
          competency_id: m.competency_id,
          competency_name: m.competency?.competency_name || '',
          contribution_level: m.contribution_level,
          learning_hours: m.learning_hours,
          assessment_method: m.assessment_method
        }))
      };
    } catch (error) {
      console.error('[CompetencyMapping] Error getting course contribution:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Bulk map competencies to program
   */
  static async bulkMapToProgram(
    programId: string,
    competencyIds: string[],
    requiredLevel: string,
    isMandatory: boolean = true
  ): Promise<{ success: number; failed: number }> {
    try {
      this.validateId(programId, 'program_id');

      const result = { success: 0, failed: 0 };

      for (const competencyId of competencyIds) {
        try {
          await this.createProgramMapping({
            program_id: programId,
            competency_id: competencyId,
            required_level: requiredLevel as any,
            is_mandatory: isMandatory
          });
          result.success++;
        } catch {
          result.failed++;
        }
      }

      return result;
    } catch (error) {
      console.error('[CompetencyMapping] Error bulk mapping:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Bulk map competencies to course
   */
  static async bulkMapToCourse(
    courseId: string,
    competencyIds: string[],
    contributionLevel?: string,
    assessmentMethod?: string
  ): Promise<{ success: number; failed: number }> {
    try {
      this.validateId(courseId, 'course_id');

      const result = { success: 0, failed: 0 };

      for (const competencyId of competencyIds) {
        try {
          await this.createCourseMapping({
            course_id: courseId,
            competency_id: competencyId,
            contribution_level: contributionLevel as any,
            assessment_method: assessmentMethod as any
          });
          result.success++;
        } catch {
          result.failed++;
        }
      }

      return result;
    } catch (error) {
      console.error('[CompetencyMapping] Error bulk mapping:', this.formatError(error));
      throw error;
    }
  }
}
