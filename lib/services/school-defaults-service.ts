/**
 * School Defaults Service
 *
 * Manages virtual degree/department records for K-12 schools.
 * Schools use a simplified academic structure where all students are assigned to:
 * - A virtual "K-12 Program" degree
 * - A virtual "Academic" department
 *
 * This service:
 * 1. Ensures virtual records exist (created during school setup)
 * 2. Provides defaults when creating students
 * 3. Enforces auto-assignment at service layer (prevents manual override)
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Database } from '@/types/supabase';

interface SchoolDefaults {
  degree_id: string;
  department_id: string;
  degree_name: string;
  department_name: string;
}

interface VirtualRecord {
  id: string;
  name: string;
  code: string;
  institution_id: string;
}

export class SchoolDefaultsService {
  private static readonly VIRTUAL_DEGREE_NAME = 'K-12 Program';
  private static readonly VIRTUAL_DEGREE_CODE = 'K12';
  private static readonly VIRTUAL_DEPARTMENT_NAME = 'Academic';
  private static readonly VIRTUAL_DEPARTMENT_CODE = 'ACAD';

  /**
   * Get or create virtual degree for a school
   *
   * Returns existing K-12 Program degree if found,
   * otherwise creates it. This ensures idempotency.
   */
  static async getOrCreateSchoolDegree(
    institutionId: string
  ): Promise<VirtualRecord | null> {
    try {
      const supabase = createClientSupabaseClient();

      // Try to find existing K-12 Program degree
      const { data: existingDegree } = await supabase
        .from('degrees')
        .select('id, degree_name, degree_code')
        .eq('institution_id', institutionId)
        .eq('degree_code', this.VIRTUAL_DEGREE_CODE)
        .single();

      if (existingDegree) {
        return {
          id: existingDegree.id,
          name: existingDegree.degree_name,
          code: existingDegree.degree_code,
          institution_id: institutionId,
        };
      }

      // Create new virtual degree for this school
      // Note: This requires the institution to exist and have proper permissions
      const { data: newDegree, error } = await supabase
        .from('degrees')
        .insert([
          {
            institution_id: institutionId,
            degree_name: this.VIRTUAL_DEGREE_NAME,
            degree_code: this.VIRTUAL_DEGREE_CODE,
            is_active: true,
          },
        ])
        .select('id, degree_name, degree_code')
        .single();

      if (error) {
        console.error('Failed to create virtual degree for school:', error);
        return null;
      }

      return {
        id: newDegree.id,
        name: newDegree.degree_name,
        code: newDegree.degree_code,
        institution_id: institutionId,
      };
    } catch (error) {
      console.error('Error in getOrCreateSchoolDegree:', error);
      return null;
    }
  }

  /**
   * Get or create virtual department for a school degree
   *
   * Returns existing Academic department if found,
   * otherwise creates it linked to the K-12 Program degree.
   */
  static async getOrCreateSchoolDepartment(
    degreeId: string
  ): Promise<VirtualRecord | null> {
    try {
      const supabase = createClientSupabaseClient();

      // Try to find existing Academic department
      const { data: existingDept } = await supabase
        .from('departments')
        .select('id, department_name, department_code')
        .eq('degree_id', degreeId)
        .eq('department_code', this.VIRTUAL_DEPARTMENT_CODE)
        .single();

      if (existingDept) {
        return {
          id: existingDept.id,
          name: existingDept.department_name,
          code: existingDept.department_code,
          institution_id: degreeId, // Note: Using degree_id as institution_id placeholder
        };
      }

      // Create new virtual department for this degree
      const { data: newDept, error } = await supabase
        .from('departments')
        .insert([
          {
            degree_id: degreeId,
            department_name: this.VIRTUAL_DEPARTMENT_NAME,
            department_code: this.VIRTUAL_DEPARTMENT_CODE,
            is_active: true,
          },
        ])
        .select('id, department_name, department_code')
        .single();

      if (error) {
        console.error('Failed to create virtual department for school:', error);
        return null;
      }

      return {
        id: newDept.id,
        name: newDept.department_name,
        code: newDept.department_code,
        institution_id: degreeId,
      };
    } catch (error) {
      console.error('Error in getOrCreateSchoolDepartment:', error);
      return null;
    }
  }

  /**
   * Get school defaults (degree_id + department_id) for a school institution
   *
   * This is the main entry point for auto-fill logic.
   * Called during student form submission to get the IDs to assign.
   */
  static async getSchoolDefaults(
    institutionId: string
  ): Promise<SchoolDefaults | null> {
    try {
      // Step 1: Ensure K-12 Program degree exists
      const degree = await this.getOrCreateSchoolDegree(institutionId);
      if (!degree) {
        console.error('Failed to get or create school degree');
        return null;
      }

      // Step 2: Ensure Academic department exists under that degree
      const department = await this.getOrCreateSchoolDepartment(degree.id);
      if (!department) {
        console.error('Failed to get or create school department');
        return null;
      }

      return {
        degree_id: degree.id,
        department_id: department.id,
        degree_name: degree.name,
        department_name: department.name,
      };
    } catch (error) {
      console.error('Error in getSchoolDefaults:', error);
      return null;
    }
  }

  /**
   * Enforce school defaults at submission time
   *
   * Called by LearnerProfileService.create() to ensure schools
   * always get the correct degree/department assignments.
   *
   * This is the service-layer enforcement mechanism that prevents
   * manual override by users or API clients.
   */
  static async enforceSchoolDefaults(
    institutionId: string,
    entityType: string | null | undefined,
    formData: Record<string, any>
  ): Promise<Record<string, any>> {
    // Only enforce for schools
    if (entityType !== 'school') {
      return formData;
    }

    // Get the canonical defaults for this school
    const defaults = await this.getSchoolDefaults(institutionId);
    if (!defaults) {
      console.warn('Could not get school defaults, proceeding without enforcement');
      return formData;
    }

    // Override any user-provided values with defaults
    return {
      ...formData,
      degree_id: defaults.degree_id,
      department_id: defaults.department_id,
    };
  }
}
