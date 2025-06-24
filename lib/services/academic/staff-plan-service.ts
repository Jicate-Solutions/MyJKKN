import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  StaffPlan,
  CreateStaffPlanDto,
  StaffPlanFilters,
  StaffPlanListResponse,
  StaffPlanCourse
} from '@/types/staff-planning';

export class StaffPlanService {
  private static supabase = createClientSupabaseClient();

  static async createStaffPlan(data: CreateStaffPlanDto): Promise<StaffPlan> {
    try {
      const { courses, ...staffPlanData } = data;

      // Start a transaction
      const { data: staffPlan, error: planError } = await this.supabase
        .from('staff_plans')
        .insert([
          {
            ...staffPlanData,
            institution_id: staffPlanData.institution_id,
            degree_id: staffPlanData.degree_id,
            program_id: staffPlanData.program_id,
            department_id: staffPlanData.department_id,
            semester_id: staffPlanData.semester_id,
            academic_year_id: staffPlanData.academic_year_id,
            start_date: staffPlanData.start_date,
            end_date: staffPlanData.end_date,
            is_active: staffPlanData.is_active
          }
        ])
        .select()
        .single();

      if (planError) throw planError;

      // Insert course assignments if courses exist and is not empty
      if (courses.length > 0) {
        const courseAssignments = courses.map((course) => ({
          staff_plan_id: staffPlan.id,
          ...course
        }));

        const { error: coursesError } = await this.supabase
          .from('staff_plan_courses')
          .insert(courseAssignments);

        if (coursesError) throw coursesError;
      }

      return staffPlan;
    } catch (error) {
      console.error('Error creating staff plan:', error);
      throw error;
    }
  }

  static async getStaffPlans(
    filters: StaffPlanFilters = {}
  ): Promise<StaffPlanListResponse> {
    try {
      let query = this.supabase.from('staff_plans').select(
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
        program:programs (
          id,
          program_name
        ),
        department:departments (
          id,
          department_name
        ),
        semester:semesters (
          id,
          semester_name
        ),
        academic_year:academic_years (
          id,
          academic_year_name
        )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Add other filters...

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: plans, error, count } = await query;

      if (error) throw error;

      return {
        data: plans || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching staff plans:', error);
      throw error;
    }
  }

  /**
   * Get available courses for a staff plan based on course mappings
   * This method fetches courses that are mapped to the specific institution/program/semester
   * @param institutionId Institution ID
   * @param departmentId Department ID
   * @param programId Program ID
   * @param semesterId Semester ID
   * @returns Array of available courses with their mapping information
   */
  static async getAvailableCoursesFromMappings(
    institutionId: string,
    departmentId: string,
    programId: string,
    semesterId: string
  ): Promise<
    Array<{
      id: string;
      course_name: string;
      course_code: string;
      mapping_id: string;
    }>
  > {
    try {
      // Fetch courses based on course mappings
      const { data, error } = await this.supabase
        .from('course_mappings')
        .select(
          `
          id,
          course:courses (
            id,
            course_name,
            course_code
          )
        `
        )
        .eq('institution_id', institutionId)
        .eq('department_id', departmentId)
        .eq('program_id', programId)
        .eq('semester_id', semesterId)
        .eq('is_active', true);

      if (error) throw error;

      // Transform the data to a more usable format
      const result: Array<{
        id: string;
        course_name: string;
        course_code: string;
        mapping_id: string;
      }> = [];

      (data || []).forEach((mapping: any) => {
        if (mapping.course && mapping.course.id) {
          result.push({
            id: mapping.course.id,
            course_name: mapping.course.course_name,
            course_code: mapping.course.course_code,
            mapping_id: mapping.id
          });
        }
      });

      return result;
    } catch (error) {
      console.error('Error fetching available courses from mappings:', error);
      throw error;
    }
  }

  static async getStaffPlanCourses(
    staffPlanId: string
  ): Promise<StaffPlanCourse[]> {
    try {
      const { data: courses, error } = await this.supabase
        .from('staff_plan_courses')
        .select(
          `
          *,
          course:courses (
            id,
            course_name,
            course_code
          ),
          staff:staff (
            id,
            first_name,
            last_name,
            staff_id
          )
        `
        )
        .eq('staff_plan_id', staffPlanId);

      if (error) throw error;
      return courses || [];
    } catch (error) {
      console.error('Error fetching staff plan courses:', error);
      throw error;
    }
  }

  static async updateStaffPlan(
    id: string,
    data: CreateStaffPlanDto
  ): Promise<StaffPlan> {
    try {
      // Extract courses from the data
      const { courses, ...staffPlanData } = data;

      // First update the staff plan
      const { data: staffPlan, error: planError } = await this.supabase
        .from('staff_plans')
        .update({
          institution_id: staffPlanData.institution_id,
          degree_id: staffPlanData.degree_id,
          department_id: staffPlanData.department_id,
          program_id: staffPlanData.program_id,
          semester_id: staffPlanData.semester_id,
          academic_year_id: staffPlanData.academic_year_id,
          start_date: staffPlanData.start_date,
          end_date: staffPlanData.end_date,
          is_active: staffPlanData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (planError) throw planError;

      // Delete existing course assignments
      const { error: deleteError } = await this.supabase
        .from('staff_plan_courses')
        .delete()
        .eq('staff_plan_id', id);

      if (deleteError) throw deleteError;

      // Insert new course assignments
      if (courses && courses.length > 0) {
        const courseAssignments = courses.map((course) => ({
          staff_plan_id: id,
          course_id: course.course_id,
          staff_id: course.staff_id,
          hours_allocated: course.hours_allocated,
          is_coordinator: course.is_coordinator,
          is_combined: course.is_combined,
          staff_type: course.staff_type
        }));

        const { error: insertError } = await this.supabase
          .from('staff_plan_courses')
          .insert(courseAssignments);

        if (insertError) throw insertError;
      }

      return staffPlan;
    } catch (error) {
      console.error('Error updating staff plan:', error);
      throw error;
    }
  }

  static async getStaffPlan(id: string): Promise<StaffPlan> {
    try {
      const { data: staffPlan, error } = await this.supabase
        .from('staff_plans')
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
          program:programs (
            id,
            program_name
          ),
          department:departments (
            id,
            department_name
          ),
          semester:semesters (
            id,
            semester_name
          ),
          academic_year:academic_years (
            id,
            academic_year_name
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      // Get course assignments with related data
      const { data: courses, error: coursesError } = await this.supabase
        .from('staff_plan_courses')
        .select(
          `
          *,
          course:courses (
            id,
            course_name,
            course_code
          ),
          staff:staff (
            id,
            first_name,
            last_name,
            staff_id
          )
        `
        )
        .eq('staff_plan_id', id);

      if (coursesError) throw coursesError;

      return {
        ...staffPlan,
        courses: courses || []
      };
    } catch (error) {
      console.error('Error fetching staff plan:', error);
      throw error;
    }
  }

  static async deleteStaffPlan(id: string): Promise<void> {
    try {
      // Check if staff plan exists
      const { data: existing, error: checkError } = await this.supabase
        .from('staff_plans')
        .select('id')
        .eq('id', id)
        .single();

      if (checkError) throw checkError;
      if (!existing) throw new Error('Staff plan not found');

      // Delete the staff plan (courses will be deleted automatically due to CASCADE)
      const { error: deleteError } = await this.supabase
        .from('staff_plans')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
    } catch (error) {
      console.error('Error deleting staff plan:', error);
      throw error;
    }
  }

  static async bulkDeleteStaffPlans(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteStaffPlan(id);
        success.push(id);
      } catch (error) {
        console.error(`Error deleting staff plan ${id}:`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  /**
   * Get staff members assigned to a specific course across all staff plans
   * This method is useful for timetable slot assignment to show only relevant staff
   * @param courseId Course ID to find assigned staff for
   * @param filters Optional filters like institution, semester, etc.
   * @returns Array of staff members with their assignment details
   */
  static async getStaffAssignedToCourse(
    courseId: string,
    filters?: {
      institution_id?: string;
      semester_id?: string;
      department_id?: string;
      program_id?: string;
      is_active?: boolean;
    }
  ): Promise<
    Array<{
      id: string;
      first_name: string;
      last_name: string;
      staff_id: string;
      designation?: string;
      hours_allocated: number;
      is_coordinator: boolean;
      staff_type: string;
      staff_plan_id: string;
    }>
  > {
    try {
      let query = this.supabase
        .from('staff_plan_courses')
        .select(
          `
          hours_allocated,
          is_coordinator,
          staff_type,
          staff_plan_id,
          staff:staff (
            id,
            first_name,
            last_name,
            staff_id,
            designation
          ),
          staff_plan:staff_plans (
            id,
            institution_id,
            semester_id,
            department_id,
            program_id,
            is_active
          )
        `
        )
        .eq('course_id', courseId);

      // Apply filters if provided
      if (filters?.is_active !== undefined) {
        query = query.eq('staff_plan.is_active', filters.is_active);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform and filter the data
      const result: Array<{
        id: string;
        first_name: string;
        last_name: string;
        staff_id: string;
        designation?: string;
        hours_allocated: number;
        is_coordinator: boolean;
        staff_type: string;
        staff_plan_id: string;
      }> = [];

      const seenStaffIds = new Set<string>();

      (data || []).forEach((assignment: any) => {
        if (
          assignment.staff &&
          assignment.staff_plan &&
          !seenStaffIds.has(assignment.staff.id)
        ) {
          // Apply additional filters
          if (
            filters?.institution_id &&
            assignment.staff_plan.institution_id !== filters.institution_id
          ) {
            return;
          }
          if (
            filters?.semester_id &&
            assignment.staff_plan.semester_id !== filters.semester_id
          ) {
            return;
          }
          if (
            filters?.department_id &&
            assignment.staff_plan.department_id !== filters.department_id
          ) {
            return;
          }
          if (
            filters?.program_id &&
            assignment.staff_plan.program_id !== filters.program_id
          ) {
            return;
          }

          seenStaffIds.add(assignment.staff.id);
          result.push({
            id: assignment.staff.id,
            first_name: assignment.staff.first_name,
            last_name: assignment.staff.last_name,
            staff_id: assignment.staff.staff_id,
            designation: assignment.staff.designation,
            hours_allocated: assignment.hours_allocated,
            is_coordinator: assignment.is_coordinator,
            staff_type: assignment.staff_type,
            staff_plan_id: assignment.staff_plan_id
          });
        }
      });

      return result;
    } catch (error) {
      console.error('Error fetching staff assigned to course:', error);
      throw error;
    }
  }
}
