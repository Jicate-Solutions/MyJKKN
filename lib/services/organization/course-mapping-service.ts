'use client';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  CourseMapping,
  CreateCourseMappingDto,
  UpdateCourseMappingDto,
  CourseMappingFilters,
  CourseMappingListResponse
} from '@/types/organizations';
import { DegreeService } from './degree-service';
import { DepartmentService } from './department-service';
import { ProgramService } from './program-service';
import { SemesterService } from './semester-service';
import { CourseService } from './course-service';

interface BulkCreateResult {
  successCount: number;
  errorCount: number;
}

export class CourseMappingService {
  private static supabase = createClientSupabaseClient();

  /**
   * Helper method to get accessible institution IDs for a user
   */
  private static async getUserAccessibleInstitutionIds(
    userId: string
  ): Promise<string[]> {
    try {
      // Import the service to avoid circular dependency
      const { UserInstitutionAccessService } = await import(
        '@/lib/services/users/user-institution-access-service'
      );
      return await UserInstitutionAccessService.getUserAccessibleInstitutionIds(
        userId
      );
    } catch (error) {
      console.error('Error getting user accessible institution IDs:', error);
      return [];
    }
  }

  /**
   * Helper method to get user's department ID for filtering
   */
  private static async getUserDepartmentId(
    userId: string
  ): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('department_id')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return (data as any)?.department_id || null;
    } catch (error) {
      console.error('Error getting user department ID:', error);
      return null;
    }
  }

  // New method to check if a course is already mapped to a semester
  static async isCourseMapped(
    courseId: string,
    semesterId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('course_mappings')
        .select('id')
        .eq('course_id', courseId)
        .eq('semester_id', semesterId)
        .limit(1);

      if (error) {
        throw error;
      }
      return data.length > 0;
    } catch (error) {
      console.error('Error checking if course is mapped:', error);
      throw error;
    }
  }

  // New method for bulk creation
  static async bulkCreateCourseMappings(
    mappings: Array<{
      institution_id: string;
      degree_id: string;
      department_id: string;
      program_id: string;
      semester_id: string;
      course_id: string;
      is_active: boolean;
    }>
  ): Promise<BulkCreateResult> {
    let successCount = 0;
    let errorCount = 0;

    // Use Promise.allSettled to handle individual errors without stopping the whole process
    const results = await Promise.allSettled(
      mappings.map((mapping) =>
        (this.supabase.from('course_mappings') as any).insert([
          {
            institution_id: mapping.institution_id,
            degree_id: mapping.degree_id,
            department_id: mapping.department_id,
            program_id: mapping.program_id,
            semester_id: mapping.semester_id,
            course_id: mapping.course_id,
            is_active: mapping.is_active
          }
        ])
      )
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        errorCount++;
        console.error('Error in bulk insert:', result.reason);
      }
    });

    return { successCount, errorCount };
  }

  static async createCourseMapping(
    data: CreateCourseMappingDto
  ): Promise<CourseMapping> {
    try {
      if (!data.course_ids || data.course_ids.length !== 1) {
        throw new Error(
          'createCourseMapping expects exactly one course ID in course_ids array'
        );
      }
      const courseId = data.course_ids[0];

      const insertData = {
        institution_id: data.institution_id,
        degree_id: data.degree_id,
        department_id: data.department_id,
        program_id: data.program_id,
        semester_id: data.semester_id,
        course_id: courseId,
        is_active: data.is_active
      };

      const { data: courseMapping, error } = await (this.supabase
        .from('course_mappings') as any)
        .insert([insertData])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            `This course (${courseId}) is already mapped to this combination`
          );
        }
        console.error('Supabase insert error for data:', insertData);
        throw error;
      }

      return courseMapping;
    } catch (error) {
      console.error('Error creating course mapping:', error);
      throw error;
    }
  }

  static async updateCourseMapping(
    id: string,
    data: UpdateCourseMappingDto
  ): Promise<CourseMapping> {
    try {
      const { data: courseMapping, error } = await (this.supabase
        .from('course_mappings') as any)
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return courseMapping;
    } catch (error) {
      console.error('Error updating course mapping:', error);
      throw error;
    }
  }

  static async deleteCourseMapping(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('course_mappings')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting course mapping:', error);
      throw error;
    }
  }

  static async getCourseMappings(
    filters: CourseMappingFilters = {}
  ): Promise<CourseMappingListResponse> {
    try {
      let query = (this.supabase as any).from('course_mappings').select(
        `
        *,
        institution:institutions (
          id,
          name
        ),
        degree:degrees (
          id,
          degree_name
        ),
        department:departments (
          id,
          department_name
        ),
        program:programs (
          id,
          program_name
        ),
        semester:semesters (
          id,
          semester_name
        ),
        course:courses (
          id,
          course_name,
          course_code
        )
      `,
        { count: 'exact' }
      );

      if (filters.search) {
        // For joined tables, we need to use a different approach
        // We'll filter by course_id from a subquery of courses that match the search
        const { data: matchingCourses } = await this.supabase
          .from('courses')
          .select('id')
          .or(
            `course_code.ilike.%${filters.search}%,course_name.ilike.%${filters.search}%`
          );

        if (matchingCourses && matchingCourses.length > 0) {
          const courseIds = matchingCourses.map((course: any) => course.id);
          query = query.in('course_id', courseIds);
        } else {
          // No matching courses found, return empty result
          return {
            data: [],
            metadata: {
              total: 0,
              page: filters.page || 1,
              limit: filters.limit || 10,
              totalPages: 0
            }
          };
        }
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }
      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }
      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }
      if (typeof filters.isActive === 'boolean') {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply institution filtering based on user access if userId is provided
      if (filters.userId && !filters.bypassInstitutionFilter) {
        const accessibleInstitutionIds =
          await this.getUserAccessibleInstitutionIds(filters.userId);
        if (accessibleInstitutionIds.length > 0) {
          query = query.in('institution_id', accessibleInstitutionIds);
        } else {
          // If user has no accessible institutions, return empty result
          return {
            data: [],
            metadata: {
              total: 0,
              page: filters.page || 1,
              limit: filters.limit || 10,
              totalPages: 0
            }
          };
        }
      }

      // Apply department filtering based on user's department if userId is provided
      if (filters.userId && !filters.bypassDepartmentFilter) {
        const userDepartmentId = await this.getUserDepartmentId(filters.userId);
        // Only apply department filter if user has a department_id (HOD, department-specific roles)
        if (userDepartmentId) {
          query = query.eq('department_id', userDepartmentId);
        }
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      // Execute query
      const { data: mappings, error, count } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return {
        data: mappings || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching course mappings:', error);
      throw new Error('Failed to fetch course mappings.');
    }
  }

  static async getCourseMapping(id: string): Promise<CourseMapping> {
    try {
      const { data: mapping, error } = await this.supabase
        .from('course_mappings')
        .select(
          `
          *,
          institution:institutions (
            id,
            name
          ),
          degree:degrees (
            id,
            degree_name
          ),
          department:departments (
            id,
            department_name
          ),
          program:programs (
            id,
            program_name
          ),
          semester:semesters (
            id,
            semester_name
          ),
          course:courses (
            id,
            course_name,
            course_code
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return mapping;
    } catch (error) {
      console.error('Error fetching course mapping:', error);
      throw error;
    }
  }

  /**
   * Get courses by institution with optional search
   * @param institutionId - The institution ID
   * @param searchTerm - Optional search term for course code or name
   * @returns List of courses for the institution
   */
  static async getCoursesByInstitution(
    institutionId: string,
    searchTerm?: string
  ): Promise<{ id: string; course_name: string; course_code: string }[]> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'get_institution_courses',
        {
          p_institution_id: institutionId,
          p_search_term: searchTerm || ''
        }
      );

      if (error) {
        console.error('Error calling get_institution_courses RPC:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching courses by institution:', error);
      throw error;
    }
  }

  /**
   * Get courses that are not yet mapped to a specific semester using RPC
   * @param institutionId - The institution ID
   * @param semesterId - The semester ID
   * @param searchTerm - Optional search term for course code or name
   * @returns List of unmapped courses
   */
  static async getUnmappedCourses(
    institutionId: string,
    semesterId: string,
    searchTerm?: string
  ): Promise<{ id: string; course_name: string; course_code: string }[]> {
    try {
      // For now, just get all courses by institution and let the frontend handle filtering
      // We can optimize this later if needed
      return await this.getCoursesByInstitution(institutionId, searchTerm);
    } catch (error) {
      console.error('Error fetching unmapped courses:', error);
      throw error;
    }
  }
}
