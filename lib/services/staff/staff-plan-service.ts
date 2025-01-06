import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  StaffPlan,
  CreateStaffPlanDto,
  StaffPlanFilters,
  StaffPlanListResponse,
  StaffPlanCourse
} from '@/types/staff-planning';

export class StaffPlanService {
  private static supabase = createClientComponentClient();

  static async createStaffPlan(data: CreateStaffPlanDto): Promise<StaffPlan> {
    try {
      // Start a transaction
      const { data: staffPlan, error: planError } = await this.supabase
        .from('staff_plans')
        .insert([
          {
            institution_id: data.institution_id,
            degree_id: data.degree_id,
            program_id: data.program_id,
            department_id: data.department_id,
            semester_id: data.semester_id,
            section: data.section,
            academic_year_id: data.academic_year_id,
            start_date: data.start_date,
            end_date: data.end_date
          }
        ])
        .select()
        .single();

      if (planError) throw planError;

      // Insert course assignments
      const courseAssignments = data.courses.map((course) => ({
        staff_plan_id: staffPlan.id,
        ...course
      }));

      const { error: coursesError } = await this.supabase
        .from('staff_plan_courses')
        .insert(courseAssignments);

      if (coursesError) throw coursesError;

      toast.success('Staff plan created successfully');
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
      const { data: staffPlan, error } = await this.supabase
        .from('staff_plans')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Update course assignments
      if (data.courses?.length) {
        // Delete existing courses
        await this.supabase
          .from('staff_plan_courses')
          .delete()
          .eq('staff_plan_id', id);

        // Insert new courses
        const courseAssignments = data.courses.map((course) => ({
          staff_plan_id: id,
          ...course
        }));

        const { error: coursesError } = await this.supabase
          .from('staff_plan_courses')
          .insert(courseAssignments);

        if (coursesError) throw coursesError;
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
      return staffPlan;
    } catch (error) {
      console.error('Error fetching staff plan:', error);
      throw error;
    }
  }
}
