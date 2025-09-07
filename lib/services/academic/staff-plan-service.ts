import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery
} from '@/lib/auth/api-institution-filter';
import { TimetableStaffSyncService } from './timetable-staff-sync-service';
import type {
  StaffPlan,
  CreateStaffPlanDto,
  StaffPlanFilters,
  StaffPlanListResponse,
  StaffPlanCourse
} from '@/types/staff-planning';

export class StaffPlanService {
  private static supabase = createClientSupabaseClient();

  // Get courses by institution for filter dropdown - only courses with staff plans
  static async getCoursesByInstitution(institutionId: string): Promise<{
    id: string;
    course_code: string;
    course_name: string;
  }[]> {
    try {
      // First get all course IDs that have staff plans for this institution
      const { data: staffPlanCourses, error: spError } = await this.supabase
        .from('staff_plan_courses')
        .select(`
          course_id,
          staff_plans!inner(institution_id)
        `)
        .eq('staff_plans.institution_id', institutionId);

      if (spError) throw spError;

      if (!staffPlanCourses || staffPlanCourses.length === 0) {
        return [];
      }

      // Get unique course IDs
      const courseIds = [...new Set(staffPlanCourses.map(spc => spc.course_id))];

      // Now get the course details
      const { data: courses, error } = await this.supabase
        .from('courses')
        .select('id, course_code, course_name')
        .in('id', courseIds)
        .eq('is_active', true)
        .order('course_name');

      if (error) throw error;
      return courses || [];
    } catch (error) {
      console.error('Error fetching courses by institution:', error);
      return [];
    }
  }

  static async createStaffPlan(data: CreateStaffPlanDto): Promise<StaffPlan> {
    try {
      const { courses, ...staffPlanData } = data;

      // Check if a staff plan already exists for this semester hierarchy
      const { data: existingPlans, error: checkError } = await this.supabase
        .from('staff_plans')
        .select('id, is_active, end_date')
        .eq('institution_id', staffPlanData.institution_id)
        .eq('program_id', staffPlanData.program_id)
        .eq('semester_id', staffPlanData.semester_id)
        .eq('academic_year_id', staffPlanData.academic_year_id);

      if (checkError) throw checkError;

      let staffPlan: any;

      if (existingPlans && existingPlans.length > 0) {
        // Update existing plan instead of creating duplicate
        const primaryPlan = existingPlans[0];

        const { data: updatedPlan, error: updateError } = await this.supabase
          .from('staff_plans')
          .update({
            end_date: staffPlanData.end_date,
            is_active: staffPlanData.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', primaryPlan.id)
          .select()
          .single();

        if (updateError) throw updateError;
        staffPlan = updatedPlan;

        console.log(
          `Updated existing staff plan ${primaryPlan.id} instead of creating duplicate`
        );
      } else {
        // Create new staff plan
        const { data: newPlan, error: planError } = await this.supabase
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
        staffPlan = newPlan;
      }

      // Insert course assignments if courses exist and is not empty
      if (courses.length > 0) {
        const courseAssignments = courses.map((course) => ({
          staff_plan_id: staffPlan.id,
          ...course
        }));

        // Use upsert to handle potential duplicates
        const { error: coursesError } = await this.supabase
          .from('staff_plan_courses')
          .upsert(courseAssignments, {
            onConflict: 'staff_id,course_id,staff_plan_id',
            ignoreDuplicates: false
          });

        if (coursesError) throw coursesError;
      }

      return staffPlan;
    } catch (error) {
      console.error('Error creating/updating staff plan:', error);
      throw error;
    }
  }

  static async getStaffPlans(
    filters: StaffPlanFilters = {}
  ): Promise<StaffPlanListResponse> {
    try {
      // Check if consolidation is disabled or if RPC doesn't exist, use original method
      if (filters.disableConsolidation) {
        return this.getStaffPlansOriginal(filters);
      }

      // Get consolidated staff plans by grouping duplicates
      const { data: rawPlans, error } = await this.supabase.rpc(
        'get_consolidated_staff_plans',
        {
          p_institution_id: filters.institution_id || null,
          p_degree_id: filters.degree_id || null,
          p_department_id: filters.department_id || null,
          p_program_id: filters.program_id || null,
          p_semester_id: filters.semester_id || null,
          p_academic_year_id: filters.academic_year_id || null,
          p_is_active: filters.isActive,
          p_search: filters.search || null,
          p_page: filters.page || 1,
          p_limit: filters.limit || 10
        }
      );

      if (error) {
        console.warn(
          'Consolidated RPC failed, falling back to original method:',
          error
        );
        return this.getStaffPlansOriginal(filters);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 10;

      return {
        data: rawPlans?.data || [],
        metadata: {
          total: rawPlans?.total_count || 0,
          page,
          limit,
          totalPages: rawPlans?.total_count
            ? Math.ceil(rawPlans.total_count / limit)
            : 0
        }
      };
    } catch (error) {
      console.error('Error fetching consolidated staff plans:', error);
      // Fallback to original method
      return this.getStaffPlansOriginal(filters);
    }
  }

  // Fallback method - original implementation
  private static async getStaffPlansOriginal(
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

      if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply course filter by joining with staff_plan_courses
      if (filters.course_id) {
        // We need to filter staff plans that have assignments for the specific course
        // This requires a different approach since we need to check the relationship table
        const { data: staffPlanIds, error: courseFilterError } = await this.supabase
          .from('staff_plan_courses')
          .select('staff_plan_id')
          .eq('course_id', filters.course_id);

        if (courseFilterError) {
          console.warn('Error filtering by course:', courseFilterError);
        } else if (staffPlanIds && staffPlanIds.length > 0) {
          const planIds = staffPlanIds.map(sp => sp.staff_plan_id);
          query = query.in('id', planIds);
        } else {
          // No staff plans found for this course, return empty result
          return {
            data: [],
            metadata: {
              total: 0,
              page: 1,
              limit: filters.limit || 10,
              totalPages: 0
            }
          };
        }
      }

      // Apply text search - PostgREST doesn't support direct nested field search in or() clause
      // We'll fetch all records and filter client-side for search functionality
      // This is a limitation when searching across related tables
      if (filters.search) {
        // For now, we'll skip the text search in the query and handle it client-side
        // after getting the data with all related fields populated
        console.log(`Search term: ${filters.search} - will be applied client-side`);
      }

      // Store pagination params for later use
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      
      // If we have a search term, we need to fetch ALL records to filter client-side
      // Otherwise, apply pagination at database level for better performance
      if (filters.search && filters.search.trim()) {
        query = query.order('created_at', { ascending: false });
      } else {
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.range(from, to).order('created_at', { ascending: false });
      }

      const { data: plans, error, count } = await query;

      if (error) throw error;

      // Add course and staff counts to each plan efficiently
      let finalPlans = plans || [];

      if (finalPlans.length > 0) {
        // Get all plan IDs for efficient batch query
        const planIds = finalPlans.map((plan) => plan.id);

        try {
          // Fetch all course assignments for all plans in one query
          const { data: allCourseCounts, error: countError } =
            await this.supabase
              .from('staff_plan_courses')
              .select('staff_plan_id, course_id, staff_id')
              .in('staff_plan_id', planIds);

          if (countError) {
            console.warn('Error fetching course counts:', countError);
            // Set default counts for all plans
            finalPlans.forEach((plan) => {
              plan.course_count = 0;
              plan.total_staff = 0;
            });
          } else {
            // Group by staff_plan_id and calculate counts
            const countsMap = new Map();

            (allCourseCounts || []).forEach((item) => {
              if (!countsMap.has(item.staff_plan_id)) {
                countsMap.set(item.staff_plan_id, {
                  courses: new Set(),
                  staff: new Set()
                });
              }
              const counts = countsMap.get(item.staff_plan_id);
              counts.courses.add(item.course_id);
              counts.staff.add(item.staff_id);
            });

            // Apply counts to each plan
            finalPlans.forEach((plan) => {
              const counts = countsMap.get(plan.id);
              if (counts) {
                plan.course_count = counts.courses.size;
                plan.total_staff = counts.staff.size;
              } else {
                plan.course_count = 0;
                plan.total_staff = 0;
              }
            });
          }
        } catch (error) {
          console.warn('Error calculating counts:', error);
          // Set default counts for all plans
          finalPlans.forEach((plan) => {
            plan.course_count = 0;
            plan.total_staff = 0;
          });
        }
      }

      // Only consolidate if explicitly requested (after adding counts)
      if (filters.enableConsolidation) {
        finalPlans = await this.consolidateDuplicatePlans(finalPlans);
      }

      // Apply client-side search filtering if search term exists
      let totalCount = count || 0;
      if (filters.search && filters.search.trim()) {
        const searchTerm = filters.search.toLowerCase().trim();
        finalPlans = finalPlans.filter((plan) => {
          // Search across all related fields
          const searchableFields = [
            plan.institution?.name,
            plan.degree?.degree_name,
            plan.program?.program_name,
            plan.department?.department_name,
            plan.semester?.semester_name,
            plan.academic_year?.academic_year_name
          ];
          
          return searchableFields.some((field) =>
            field && field.toLowerCase().includes(searchTerm)
          );
        });
        
        // Update total count after filtering
        totalCount = finalPlans.length;
        
        // Apply client-side pagination after filtering
        const from = (page - 1) * limit;
        const to = from + limit;
        finalPlans = finalPlans.slice(from, to);
      }

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: finalPlans,
        metadata: {
          total: totalCount,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching staff plans:', error);
      throw error;
    }
  }

  // Helper method to consolidate duplicate plans client-side with proper course/staff counts
  private static async consolidateDuplicatePlans(plans: any[]): Promise<any[]> {
    const consolidatedMap = new Map();

    // Group plans by semester hierarchy
    plans.forEach((plan) => {
      const key = `${plan.institution_id}-${plan.program_id}-${plan.semester_id}-${plan.academic_year_id}`;

      if (consolidatedMap.has(key)) {
        const existing = consolidatedMap.get(key);
        existing.plan_ids.push(plan.id);
        existing.end_date =
          new Date(existing.end_date) > new Date(plan.end_date)
            ? existing.end_date
            : plan.end_date;
        existing.is_active = existing.is_active || plan.is_active;
        existing.duplicate_count = existing.duplicate_count + 1;
      } else {
        consolidatedMap.set(key, {
          ...plan,
          plan_ids: [plan.id],
          duplicate_count: 1,
          consolidated_id: key
        });
      }
    });

    // Now fetch course data for each consolidated group
    const consolidatedPlans = [];

    for (const [key, consolidatedPlan] of consolidatedMap) {
      try {
        // Get all course assignments for all plans in this semester
        const { data: allCourses, error: coursesError } = await this.supabase
          .from('staff_plan_courses')
          .select('course_id, staff_id')
          .in('staff_plan_id', consolidatedPlan.plan_ids);

        if (coursesError) {
          console.warn(
            'Error fetching courses for consolidation:',
            coursesError
          );
          // Use fallback counts
          consolidatedPlan.course_count = consolidatedPlan.duplicate_count;
          consolidatedPlan.total_staff = consolidatedPlan.duplicate_count;
        } else {
          // Calculate actual unique course and staff counts
          const uniqueCourses = new Set(
            allCourses?.map((c) => c.course_id) || []
          );
          const uniqueStaff = new Set(allCourses?.map((c) => c.staff_id) || []);

          consolidatedPlan.course_count = uniqueCourses.size;
          consolidatedPlan.total_staff = uniqueStaff.size;
        }
      } catch (error) {
        console.warn('Error in consolidation:', error);
        // Use fallback counts
        consolidatedPlan.course_count = consolidatedPlan.duplicate_count;
        consolidatedPlan.total_staff = consolidatedPlan.duplicate_count;
      }

      consolidatedPlans.push(consolidatedPlan);
    }

    return consolidatedPlans;
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

  /**
   * Get consolidated staff plan details for a semester hierarchy
   * This method aggregates all staff plans for the same semester and returns
   * a unified view with all courses and staff assignments
   */
  static async getConsolidatedStaffPlan(
    institutionId: string,
    programId: string,
    semesterId: string,
    academicYearId: string
  ): Promise<
    StaffPlan & {
      total_courses: number;
      total_staff: number;
      all_courses: StaffPlanCourse[];
    }
  > {
    try {
      // Get all staff plans for this semester hierarchy
      const { data: staffPlans, error: plansError } = await this.supabase
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
        .eq('institution_id', institutionId)
        .eq('program_id', programId)
        .eq('semester_id', semesterId)
        .eq('academic_year_id', academicYearId)
        .order('created_at', { ascending: true });

      if (plansError) throw plansError;

      if (!staffPlans || staffPlans.length === 0) {
        // Return a default empty structure instead of throwing an error
        return {
          id: '',
          institution_id: institutionId,
          degree_id: '',
          department_id: '',
          program_id: programId,
          semester_id: semesterId,
          academic_year_id: academicYearId,
          start_date: new Date().toISOString(),
          end_date: new Date().toISOString(),
          plan_name: 'No staff plans available',
          is_active: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          institution: undefined,
          degree: undefined,
          program: undefined,
          department: undefined,
          semester: undefined,
          academic_year: undefined,
          total_courses: 0,
          total_staff: 0,
          all_courses: []
        } as StaffPlan & {
          total_courses: number;
          total_staff: number;
          all_courses: StaffPlanCourse[];
        };
      }

      // Use the earliest created plan as the primary plan
      const primaryPlan = staffPlans[0];
      const allPlanIds = staffPlans.map((plan) => plan.id);

      // Get all course assignments for all plans in this semester
      const { data: allCourses, error: coursesError } = await this.supabase
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
        .in('staff_plan_id', allPlanIds);

      if (coursesError) throw coursesError;

      // Calculate consolidated metrics
      const uniqueCourses = new Set(allCourses?.map((c) => c.course_id) || []);
      const uniqueStaff = new Set(allCourses?.map((c) => c.staff_id) || []);

      // Consolidate plan data (use latest end_date and any active status)
      const consolidatedPlan = {
        ...primaryPlan,
        end_date: staffPlans.reduce(
          (latest, plan) =>
            new Date(plan.end_date) > new Date(latest) ? plan.end_date : latest,
          primaryPlan.end_date
        ),
        is_active: staffPlans.some((plan) => plan.is_active),
        updated_at: staffPlans.reduce(
          (latest, plan) =>
            new Date(plan.updated_at) > new Date(latest)
              ? plan.updated_at
              : latest,
          primaryPlan.updated_at
        ),
        total_courses: uniqueCourses.size,
        total_staff: uniqueStaff.size,
        all_courses: allCourses || [],
        courses: allCourses || [] // For backward compatibility
      };

      return consolidatedPlan;
    } catch (error) {
      console.error('Error fetching consolidated staff plan:', error);
      throw error;
    }
  }

  static async deleteStaffPlan(id: string): Promise<void> {
    try {
      // Delete the staff plan (courses will be deleted automatically due to CASCADE)
      const { error: deleteError, count } = await this.supabase
        .from('staff_plans')
        .delete({ count: 'exact' })
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Check if any rows were actually deleted
      if (count === 0) {
        throw new Error('Staff plan not found or has already been deleted');
      }
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
      staff_type: string;
      staff_plan_id: string;
    }>
  > {
    try {
      let query = this.supabase
        .from('staff_plan_courses')
        .select(
          `
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

  /**
   * Update staff assignment for a course with timetable synchronization
   * This method checks for timetable conflicts and optionally syncs changes
   */
  static async updateStaffAssignmentWithSync(
    staffPlanId: string,
    courseId: string,
    oldStaffId: string,
    newStaffId: string,
    staffType: string,
    autoSyncTimetables: boolean = false
  ): Promise<{ success: boolean; conflicts?: any; syncResults?: any }> {
    try {
      // First check what timetables would be affected
      const impact = await TimetableStaffSyncService.checkStaffPlanningImpact(
        courseId,
        oldStaffId,
        newStaffId
      );

      // Update the staff plan assignment
      const { error: updateError } = await this.supabase
        .from('staff_plan_courses')
        .update({
          staff_id: newStaffId,
          staff_type: staffType,
          updated_at: new Date().toISOString()
        })
        .eq('staff_plan_id', staffPlanId)
        .eq('course_id', courseId)
        .eq('staff_id', oldStaffId);

      if (updateError) {
        throw updateError;
      }

      let syncResults;
      if (impact && impact.affected_timetables.length > 0) {
        if (autoSyncTimetables) {
          // Auto-sync timetables
          syncResults = await TimetableStaffSyncService.syncTimetablesToStaffPlanning(
            impact.affected_timetables,
            courseId,
            oldStaffId,
            newStaffId
          );
        }

        return {
          success: true,
          conflicts: impact,
          syncResults
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating staff assignment with sync:', error);
      throw error;
    }
  }

  /**
   * Get all current conflicts between staff planning and timetables
   * Use this to show users what needs to be resolved
   */
  static async getAllTimetableConflicts(): Promise<any[]> {
    try {
      return await TimetableStaffSyncService.getAllTimetableStaffConflicts();
    } catch (error) {
      console.error('Error getting timetable conflicts:', error);
      return [];
    }
  }
}
