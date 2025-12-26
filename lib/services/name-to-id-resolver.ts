// ============================================
// NAME TO ID RESOLVER SERVICE
// ============================================
// Created: 2025-01-26
// Purpose: Convert display names to database IDs for bulk operations
// Usage: Resolves Institution, Degree, Department, Program, Semester, Section, Academic Year, Regulation, Batch names to IDs
// ============================================

import { createClient } from '@supabase/supabase-js';

// Create admin client for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export interface NameToIdResult {
  id: string | null;
  found: boolean;
  error?: string;
}

/**
 * Name to ID Resolver Service
 * Converts human-readable names to database UUIDs
 */
export class NameToIdResolver {
  /**
   * Resolve Degree name to ID
   * @param degreeName - The degree name (e.g., "B.E - Bachelor of Engineering")
   * @param institutionId - Optional institution filter
   */
  static async resolveDegreeId(degreeName: string, institutionId?: string): Promise<NameToIdResult> {
    if (!degreeName || degreeName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      let query = supabaseAdmin
        .from('degrees')
        .select('id')
        .ilike('degree_name', degreeName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return { id: null, found: false, error: `Degree "${degreeName}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Department name to ID
   * @param departmentName - The department name (e.g., "Computer Science and Engineering")
   * @param institutionId - Optional institution filter
   */
  static async resolveDepartmentId(departmentName: string, institutionId?: string): Promise<NameToIdResult> {
    if (!departmentName || departmentName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      let query = supabaseAdmin
        .from('departments')
        .select('id')
        .ilike('department_name', departmentName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return { id: null, found: false, error: `Department "${departmentName}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Program name to ID
   * @param programName - The program name (e.g., "CSE - Computer Science")
   * @param institutionId - Optional institution filter
   * @param departmentId - Optional department filter
   */
  static async resolveProgramId(programName: string, institutionId?: string, departmentId?: string): Promise<NameToIdResult> {
    if (!programName || programName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      let query = supabaseAdmin
        .from('programs')
        .select('id')
        .ilike('program_name', programName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return { id: null, found: false, error: `Program "${programName}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Semester name to ID
   * @param semesterName - The semester name (e.g., "I Year I Semester")
   * @param institutionId - Optional institution filter
   * @param programId - Optional program filter
   */
  static async resolveSemesterId(semesterName: string, institutionId?: string, programId?: string): Promise<NameToIdResult> {
    if (!semesterName || semesterName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      let query = supabaseAdmin
        .from('semesters')
        .select('id')
        .ilike('semester_name', semesterName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (programId) {
        query = query.eq('program_id', programId);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return { id: null, found: false, error: `Semester "${semesterName}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Section name to ID
   * @param sectionName - The section name (e.g., "A Section")
   * @param institutionId - Optional institution filter
   * @param semesterId - Optional semester filter
   */
  static async resolveSectionId(sectionName: string, institutionId?: string, semesterId?: string): Promise<NameToIdResult> {
    if (!sectionName || sectionName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      let query = supabaseAdmin
        .from('sections')
        .select('id')
        .ilike('section_name', sectionName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (semesterId) {
        query = query.eq('semester_id', semesterId);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return { id: null, found: false, error: `Section "${sectionName}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Academic Year name to ID
   * @param yearName - The academic year name (e.g., "2024-2025")
   * @param institutionId - Optional institution filter
   */
  static async resolveAcademicYearId(yearName: string, institutionId?: string): Promise<NameToIdResult> {
    if (!yearName || yearName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      let query = supabaseAdmin
        .from('academic_years')
        .select('id')
        .ilike('academic_year_name', yearName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return { id: null, found: false, error: `Academic Year "${yearName}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Regulation code/year to ID
   * @param regulationValue - The regulation code or year (e.g., "R2021" or "2021")
   * @param institutionId - Optional institution filter
   */
  static async resolveRegulationId(regulationValue: string, institutionId?: string): Promise<NameToIdResult> {
    if (!regulationValue || regulationValue.trim() === '') {
      return { id: null, found: false };
    }

    try {
      let query = supabaseAdmin
        .from('regulations')
        .select('id');

      // Try to match by regulation_code first, then regulation_year
      const trimmedValue = regulationValue.trim();

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // Use OR condition to match either regulation_code or regulation_year
      query = query.or(`regulation_code.ilike.${trimmedValue},regulation_year.ilike.${trimmedValue}`);

      const { data, error } = await query.single();

      if (error || !data) {
        return { id: null, found: false, error: `Regulation "${regulationValue}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Batch name to ID
   * @param batchName - The batch name (e.g., "2021-2025")
   * @param institutionId - Optional institution filter
   */
  static async resolveBatchId(batchName: string, institutionId?: string): Promise<NameToIdResult> {
    if (!batchName || batchName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      let query = supabaseAdmin
        .from('batches')
        .select('id')
        .ilike('batch_name', batchName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return { id: null, found: false, error: `Batch "${batchName}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Institution name to ID
   * @param institutionName - The institution name (e.g., "JKKN College of Engineering")
   */
  static async resolveInstitutionId(institutionName: string): Promise<NameToIdResult> {
    if (!institutionName || institutionName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('institutions')
        .select('id')
        .ilike('name', institutionName.trim())
        .single();

      if (error || !data) {
        return { id: null, found: false, error: `Institution "${institutionName}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
