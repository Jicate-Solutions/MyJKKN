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
            section: staffPlanData.section,
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
          section: staffPlanData.section,
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
}
