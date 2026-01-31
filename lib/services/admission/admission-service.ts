import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  Admission,
  AdmissionFilters,
  AdmissionListResponse,
  CreateAdmissionDto,
  UpdateAdmissionDto,
  AdmissionAnalyticsFilters,
  AdmissionDashboardAnalytics
} from '@/types/admission';
import { StudentService } from '@/lib/services/student/student-service';
import toast from 'react-hot-toast';

export class AdmissionService {
  private static supabase = createClientSupabaseClient();

  // Generate unique application ID
  private static async generateApplicationId(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = `APP${currentYear}`;

    // Get the highest application ID for the current year
    const { data, error } = await (this.supabase as any)
      .from('admissions')
      .select('application_id')
      .like('application_id', `${prefix}%`)
      .order('application_id', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error getting latest application ID:', error);
      // Fallback to timestamp-based ID
      return `${prefix}${Date.now()}`;
    }

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastId = (data as any[])[0].application_id;
      const numberPart = lastId.replace(prefix, '');
      nextNumber = parseInt(numberPart) + 1;
    }

    // Format with leading zeros (6 digits)
    const formattedNumber = nextNumber.toString().padStart(6, '0');
    return `${prefix}${formattedNumber}`;
  }

  static async createAdmission(data: CreateAdmissionDto): Promise<Admission> {
    try {
      // Database trigger will auto-generate application_id in JKKN-{counselling_code}-number format
      console.log('Creating admission with data:', {
        institution_id: data.institution_id,
        first_name: data.first_name
      });

      const { data: admission, error } = await (this.supabase as any)
        .from('admissions')
        .insert([
          {
            ...data,
            // Remove application_id - let database trigger handle it
            status: data.status || 'pending',
            created_by: (await this.supabase.auth.getUser()).data.user?.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      return admission as Admission;
    } catch (error) {
      console.error('Error creating admission:', error);
      throw error;
    }
  }

  static async createAdmissionFromDraft(
    draftId: string,
    data: CreateAdmissionDto
  ): Promise<Admission> {
    try {
      // Get the draft admission to preserve the application_id
      const { data: draft, error: draftError } = await (this.supabase as any)
        .from('admissions')
        .select('application_id')
        .eq('id', draftId)
        .eq('status', 'draft')
        .single();

      if (draftError) throw draftError;

      // Update the draft to final status instead of creating new record
      const { data: admission, error } = await (this.supabase as any)
        .from('admissions')
        .update({
          ...data,
          application_id: draft.application_id, // Preserve existing application_id
          status: 'pending',
          updated_by: (await this.supabase.auth.getUser()).data.user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', draftId)
        .select()
        .single();

      if (error) throw error;

      return admission as Admission;
    } catch (error) {
      console.error('Error creating admission from draft:', error);
      throw error;
    }
  }

  static async saveDraftAdmission(
    data: Partial<CreateAdmissionDto>
  ): Promise<Admission> {
    try {
      // Database trigger will auto-generate application_id in JKKN-{counselling_code}-number format
      console.log('Saving draft admission with data:', {
        institution_id: data.institution_id,
        first_name: data.first_name
      });

      const { data: admission, error } = await (this.supabase as any)
        .from('admissions')
        .insert([
          {
            ...data,
            // Remove application_id - let database trigger handle it
            status: 'draft',
            created_by: (await this.supabase.auth.getUser()).data.user?.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      return admission as Admission;
    } catch (error) {
      console.error('Error saving draft admission:', error);
      throw error;
    }
  }

  static async updateDraftAdmission(
    id: string,
    data: Partial<CreateAdmissionDto>
  ): Promise<Admission> {
    try {
      const { data: admission, error } = await (this.supabase as any)
        .from('admissions')
        .update({
          ...data,
          updated_by: (await this.supabase.auth.getUser()).data.user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return admission as Admission;
    } catch (error) {
      console.error('Error updating draft admission:', error);
      throw error;
    }
  }

  static async updateAdmission(
    id: string,
    data: UpdateAdmissionDto
  ): Promise<Admission> {
    try {
      const { data: admission, error } = await (this.supabase as any)
        .from('admissions')
        .update({
          ...data,
          updated_by: (await this.supabase.auth.getUser()).data.user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return admission as Admission;
    } catch (error) {
      console.error('Error updating admission:', error);
      throw error;
    }
  }

  static async updateAdmissionStatus(
    id: string,
    status: string
  ): Promise<Admission> {
    try {
      const { data: admission, error } = await (this.supabase as any)
        .from('admissions')
        .update({
          status,
          updated_by: (await this.supabase.auth.getUser()).data.user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Auto-trigger: If status is "approved", create a student record
      if (status === 'approved') {
        try {
          // First check if student already exists for this admission
          const { data: existingStudent } = await (this.supabase as any)
            .from('students')
            .select('id')
            .eq('admission_id', id)
            .maybeSingle();

          if (existingStudent) {
            console.log('Student record already exists for this admission');
            toast.success('Student record already exists in onboarding module');
          } else {
            // Fetch the admission to ensure we have all data
            const { data: fullAdmission } = await (this.supabase as any)
              .from('admissions')
              .select('*')
              .eq('id', id)
              .single();

            if (fullAdmission) {
              // Build full name with fallbacks to prevent null
              const fullName = fullAdmission.first_name
                ? `${fullAdmission.first_name} ${fullAdmission.last_name || ''}`.trim()
                : (fullAdmission.applicant_name || 'Unknown Applicant');

              // Create student record in a non-blocking way
              const student = await StudentService.createStudentFromAdmission(
                id,
                fullAdmission.institution_id,
                {
                  full_name: fullName,
                  email: fullAdmission.email || fullAdmission.student_email || null,
                  phone: fullAdmission.phone || fullAdmission.student_mobile || '',
                  program_id: fullAdmission.program_id,
                  semester_id: fullAdmission.semester_id,
                  academic_year: fullAdmission.academic_year
                }
              );
              if (student) {
                console.log('Student created successfully:', student.id);

                // Manually trigger an event to refresh all related data
                // This is a no-op in the code, but helps document the intention
                console.log('Student onboarding data refreshed');
              } else {
                console.error('Failed to create student record from admission');
                toast.error('Student creation failed - please try again');
              }
            } else {
              console.error('Admission not found for student creation');
              toast.error(
                'Failed to create student record: Admission not found'
              );
            }
          }
        } catch (studentError) {
          console.error('Error creating student record:', studentError);
          toast.error('Failed to create student record from admission');
          // We don't throw here to prevent blocking the status update
        }
      }

      return admission as Admission;
    } catch (error) {
      console.error('Error updating admission status:', error);
      toast.error('Failed to update admission status');
      throw error;
    }
  }

  static async deleteAdmission(id: string): Promise<void> {
    try {
      // First check if admission has associated student record
      const { data: studentCheck } = await (this.supabase as any)
        .from('students')
        .select('id')
        .eq('admission_id', id)
        .maybeSingle();

      if (studentCheck) {
        toast.error(
          'Cannot delete this admission - student record exists. Please handle through Student Management.'
        );
        throw new Error('Cannot delete admission with existing student record');
      }

      const { error } = await (this.supabase as any)
        .from('admissions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Admission application deleted successfully');
    } catch (error: any) {
      console.error('Error deleting admission:', error);

      // Handle specific foreign key constraint error
      if (error.code === '23503') {
        toast.error(
          'Cannot delete this admission - it has associated student records'
        );
      } else if (error.message?.includes('student record exists')) {
        // Already handled above with specific message
      } else {
        toast.error('Failed to delete admission application');
      }
      throw error;
    }
  }

  static async bulkDeleteAdmissions(ids: string[]): Promise<void> {
    try {
      // First check which admissions have associated student records
      const { data: studentsCheck, error: checkError } = await (this.supabase as any)
        .from('students')
        .select('admission_id')
        .in('admission_id', ids);

      if (checkError) throw checkError;

      const admissionsWithStudents =
        studentsCheck?.map((s) => s.admission_id) || [];
      const admissionsToDelete = ids.filter(
        (id) => !admissionsWithStudents.includes(id)
      );

      const results = {
        deleted: 0,
        skipped: admissionsWithStudents.length,
        errors: [] as string[]
      };

      // Delete only admissions without student records
      if (admissionsToDelete.length > 0) {
        const { error } = await (this.supabase as any)
          .from('admissions')
          .delete()
          .in('id', admissionsToDelete);

        if (error) throw error;
        results.deleted = admissionsToDelete.length;
      }

      // Show appropriate message based on results
      if (results.deleted > 0 && results.skipped > 0) {
        toast.success(
          `Deleted ${results.deleted} admission(s). Skipped ${results.skipped} admission(s) with student records.`
        );
      } else if (results.deleted > 0) {
        toast.success(
          `Successfully deleted ${results.deleted} admission application${
            results.deleted > 1 ? 's' : ''
          }`
        );
      } else if (results.skipped > 0) {
        toast.error(
          `Cannot delete selected admissions - they have associated student records. Please handle through Student Management.`
        );
      }

      if (results.skipped > 0) {
        // Still throw error to indicate partial failure
        throw new Error(
          `${results.skipped} admission(s) could not be deleted due to existing student records`
        );
      }
    } catch (error: any) {
      console.error('Error bulk deleting admissions:', error);

      // Handle specific foreign key constraint error
      if (error.code === '23503') {
        toast.error(
          'Some admissions cannot be deleted - they have associated student records'
        );
      } else if (error.message?.includes('student records')) {
        // Already handled above
      } else {
        toast.error('Failed to delete selected admission applications');
      }
      throw error;
    }
  }

  /**
   * Bulk update admission status
   * Updates multiple admissions to a new status
   * Auto-creates student records when status is 'approved'
   */
  static async bulkUpdateAdmissionStatus(
    ids: string[],
    newStatus: string
  ): Promise<{
    updated: number;
    failed: number;
    studentsCreated: number;
  }> {
    try {
      const results = {
        updated: 0,
        failed: 0,
        studentsCreated: 0
      };

      // Get current user for audit trail
      const {
        data: { user }
      } = await this.supabase.auth.getUser();
      const userId = user?.id;

      // Update all admissions in batch
      // NOTE: Select all fields (*) because we need them for student record creation
      const { data: updatedAdmissions, error: updateError } =
        await (this.supabase as any)
          .from('admissions')
          .update({
            status: newStatus,
            updated_by: userId,
            updated_at: new Date().toISOString()
          })
          .in('id', ids)
          .select('*');

      if (updateError) {
        console.error('Error bulk updating admission status:', updateError);
        throw updateError;
      }

      results.updated = updatedAdmissions?.length || 0;
      results.failed = ids.length - results.updated;

      // If status is 'approved', create student records for each
      if (
        newStatus === 'approved' &&
        updatedAdmissions &&
        updatedAdmissions.length > 0
      ) {
        console.log(
          `Creating student records for ${updatedAdmissions.length} approved admissions...`
        );

        // Check which admissions already have student records
        const { data: existingStudents } = await (this.supabase as any)
          .from('students')
          .select('admission_id')
          .in(
            'admission_id',
            updatedAdmissions.map((a) => a.id)
          );

        const existingAdmissionIds =
          existingStudents?.map((s) => s.admission_id) || [];
        const admissionsNeedingStudents = updatedAdmissions.filter(
          (a) => !existingAdmissionIds.includes(a.id)
        );

        console.log(
          `${admissionsNeedingStudents.length} admissions need student records`
        );

        // Create student records for admissions that don't have one
        for (const admission of admissionsNeedingStudents) {
          try {
            // Build full name with fallbacks to prevent null
            const fullName = admission.first_name
              ? `${admission.first_name} ${admission.last_name || ''}`.trim()
              : (admission.applicant_name || 'Unknown Applicant');

            const student = await StudentService.createStudentFromAdmission(
              admission.id,
              admission.institution_id,
              {
                full_name: fullName,
                email: admission.email || admission.student_email || null,
                phone: admission.phone || admission.student_mobile || '',
                program_id: admission.program_id,
                semester_id: admission.semester_id,
                academic_year: admission.academic_year
              }
            );
            if (student) {
              results.studentsCreated++;
              console.log(`Student created for admission ${admission.id}`);
            }
          } catch (studentError) {
            console.error(
              `Failed to create student for admission ${admission.id}:`,
              studentError
            );
            // Continue with other students even if one fails
          }
        }
      }

      // Show appropriate message based on results
      const statusLabel =
        newStatus.charAt(0).toUpperCase() + newStatus.slice(1);

      if (results.updated > 0 && results.failed === 0) {
        if (results.studentsCreated > 0) {
          toast.success(
            `Updated ${results.updated} admission${
              results.updated > 1 ? 's' : ''
            } to ${statusLabel}. ` +
              `Created ${results.studentsCreated} student record${
                results.studentsCreated > 1 ? 's' : ''
              }.`
          );
        } else {
          toast.success(
            `Successfully updated ${results.updated} admission${
              results.updated > 1 ? 's' : ''
            } to ${statusLabel}`
          );
        }
      } else if (results.updated > 0 && results.failed > 0) {
        toast.error(
          `Updated ${results.updated} admission${
            results.updated > 1 ? 's' : ''
          }. ` + `Failed to update ${results.failed}.`
        );
      } else {
        toast.error('Failed to update selected admissions');
        throw new Error('No admissions were updated');
      }

      return results;
    } catch (error: any) {
      console.error('Error bulk updating admission status:', error);

      if (!error.message?.includes('No admissions were updated')) {
        toast.error(
          'Failed to update admission status for selected applications'
        );
      }

      throw error;
    }
  }

  static async getAdmissions(
    filters: AdmissionFilters = {}
  ): Promise<AdmissionListResponse> {
    try {
      console.log(
        'AdmissionService.getAdmissions called with filters:',
        filters
      );

      // Use Supabase's built-in join capabilities
      let query = (this.supabase as any).from('admissions').select(
        `
          *,
          institution:institutions!institution_id(id, name),
          program:programs!program_id(id, program_name),
          student:students!admission_id(id)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,student_email.ilike.%${filters.search}%,student_mobile.ilike.%${filters.search}%,application_id.ilike.%${filters.search}%`
        );
      }

      if (filters.name) {
        query = query.or(
          `first_name.ilike.%${filters.name}%,last_name.ilike.%${filters.name}%`
        );
      }

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.institution && filters.institution !== 'all') {
        query = query.eq('institution_id', filters.institution);
      }

      if (filters.department && filters.department !== 'all') {
        query = query.eq('department_id', filters.department);
      }

      if (filters.entry_type && filters.entry_type !== 'all') {
        query = query.eq('entry_type', filters.entry_type);
      }

      if (filters.course && filters.course !== 'all') {
        query = query.eq('program_id', filters.course);
      }

      if (filters.fromDate) {
        query = query.gte('created_at', filters.fromDate);
      }

      if (filters.toDate) {
        // Add one day to include the entire toDate
        const nextDay = new Date(filters.toDate);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt('created_at', nextDay.toISOString());
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: admissions, error, count } = await query;

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }

      console.log('Query returned data:', {
        count,
        dataLength: admissions?.length || 0,
        firstRecord: admissions?.[0] || null
      });

      return {
        data: admissions || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching admissions:', error);
      toast.error('Failed to fetch admission applications');
      throw error;
    }
  }

  static async getAdmission(id: string): Promise<Admission> {
    try {
      const { data: admission, error } = await (this.supabase as any)
        .from('admissions')
        .select(
          `
          *,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          course:courses(id, course_name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return admission as Admission;
    } catch (error) {
      console.error('Error fetching admission:', error);
      toast.error('Failed to fetch admission details');
      throw error;
    }
  }

  static async getAdmissionStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    waitlisted: number;
    enrolled: number;
  }> {
    try {
      // Get total count
      const { count: total, error: totalError } = await (this.supabase as any)
        .from('admissions')
        .select('*', { count: 'exact', head: true });

      if (totalError) throw totalError;

      // Get counts by status
      const statuses = [
        'pending',
        'approved',
        'rejected',
        'waitlisted',
        'enrolled'
      ];
      const statusCounts = await Promise.all(
        statuses.map(async (status) => {
          const { count, error } = await (this.supabase as any)
            .from('admissions')
            .select('*', { count: 'exact', head: true })
            .eq('status', status);

          if (error) throw error;
          return { status, count: count || 0 };
        })
      );

      const counts = statusCounts.reduce(
        (acc, { status, count }) => ({ ...acc, [status]: count }),
        {} as Record<string, number>
      );

      return {
        total: total || 0,
        pending: counts.pending || 0,
        approved: counts.approved || 0,
        rejected: counts.rejected || 0,
        waitlisted: counts.waitlisted || 0,
        enrolled: counts.enrolled || 0
      };
    } catch (error) {
      console.error('Error fetching admission stats:', error);
      toast.error('Failed to fetch admission statistics');
      throw error;
    }
  }

  /**
   * Get comprehensive dashboard analytics with institution filtering
   *
   * @param filters - Analytics filters
   * @param supabaseClient - Optional Supabase client (for server-side calls)
   * @param userContext - Optional user context (for server-side calls)
   */
  static async getDashboardAnalytics(
    filters: AdmissionAnalyticsFilters = {},
    supabaseClient?: any,
    userContext?: {
      userId: string;
      institutionId?: string;
      isSuperAdmin: boolean;
    }
  ): Promise<AdmissionDashboardAnalytics> {
    try {
      console.log(
        '[admissions/analytics] Fetching dashboard analytics with filters:',
        filters
      );

      // Use provided client or default to class instance
      const supabase = supabaseClient || this.supabase;

      const effectiveFilters = { ...filters };

      // If user context is provided (from API route), use it directly
      if (userContext) {
        if (!userContext.isSuperAdmin && userContext.institutionId) {
          effectiveFilters.institution_id = userContext.institutionId;
          console.log(
            '[admissions/analytics] Non-super-admin user, filtering to institution:',
            userContext.institutionId
          );
        }
      } else {
        // Otherwise, get current user from client-side auth
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data: profile } = await supabase
          .from('profiles')
          .select('institution_id, is_super_admin, role')
          .eq('id', user.id)
          .single();

        // Force institution filter for non-super-admin
        const isSuperAdmin =
          profile?.is_super_admin || profile?.role === 'super_admin';
        if (!isSuperAdmin && profile?.institution_id) {
          effectiveFilters.institution_id = profile.institution_id;
          console.log(
            '[admissions/analytics] Non-super-admin user, filtering to institution:',
            profile.institution_id
          );
        }
      }

      // Call database function for combined analytics (admissions + students)
      const { data: combinedData, error: combinedError } = await supabase.rpc(
        'get_combined_enrollment_analytics',
        {
          p_institution_id: effectiveFilters.institution_id || null,
          p_date_from: effectiveFilters.dateRange?.from?.toISOString() || null,
          p_date_to: effectiveFilters.dateRange?.to?.toISOString() || null,
          p_degree_id: effectiveFilters.degree_id || null,
          p_department_id: effectiveFilters.department_id || null,
          p_program_id: effectiveFilters.program_id || null
        }
      );

      if (combinedError) {
        console.error(
          '[admissions/analytics] Combined analytics error:',
          combinedError
        );
        // Don't throw - fallback to old method if RPC fails
      }

      // Extract overview from database function result
      const combinedOverview = combinedData?.overview || null;

      console.log(
        '[admissions/analytics] Combined overview from database:',
        combinedOverview
      );

      // Fetch admissions using pagination to bypass Supabase 1000 row limit
      let allAdmissionsData: Admission[] = [];
      let hasMoreAdmissions = true;
      const admissionPageSize = 1000;
      let admissionPage = 0;

      while (hasMoreAdmissions) {
        let baseQuery = supabase
          .from('admissions')
          .select('*');

        // Apply filters
        if (effectiveFilters.institution_id) {
          baseQuery = baseQuery.eq('institution_id', effectiveFilters.institution_id);
        }
        if (effectiveFilters.degree_id) {
          baseQuery = baseQuery.eq('degree_id', effectiveFilters.degree_id);
        }
        if (effectiveFilters.department_id) {
          baseQuery = baseQuery.eq('department_id', effectiveFilters.department_id);
        }
        if (effectiveFilters.program_id) {
          baseQuery = baseQuery.eq('program_id', effectiveFilters.program_id);
        }
        if (effectiveFilters.academic_year_id) {
          baseQuery = baseQuery.eq('academic_year_id', effectiveFilters.academic_year_id);
        }
        if (effectiveFilters.status) {
          baseQuery = baseQuery.eq('status', effectiveFilters.status);
        }
        if (effectiveFilters.state) {
          baseQuery = baseQuery.eq('permanent_address_state', effectiveFilters.state);
        }
        if (effectiveFilters.district) {
          baseQuery = baseQuery.eq('permanent_address_district', effectiveFilters.district);
        }
        if (effectiveFilters.dateRange?.from) {
          baseQuery = baseQuery.gte('created_at', effectiveFilters.dateRange.from.toISOString());
        }
        if (effectiveFilters.dateRange?.to) {
          const nextDay = new Date(effectiveFilters.dateRange.to);
          nextDay.setDate(nextDay.getDate() + 1);
          baseQuery = baseQuery.lt('created_at', nextDay.toISOString());
        }

        // Apply pagination at the end
        baseQuery = baseQuery.range(
          admissionPage * admissionPageSize,
          (admissionPage + 1) * admissionPageSize - 1
        );

        const { data: pageData, error: pageError } = await baseQuery;

        if (pageError) {
          console.error('[admissions/analytics] Error fetching admissions page:', pageError);
          throw pageError;
        }

        if (pageData && pageData.length > 0) {
          allAdmissionsData = allAdmissionsData.concat(pageData as Admission[]);
          admissionPage++;

          // If we got less than page size, we've reached the end
          if (pageData.length < admissionPageSize) {
            hasMoreAdmissions = false;
          }
        } else {
          hasMoreAdmissions = false;
        }
      }

      const admissions = allAdmissionsData;

      const total = admissions?.length || 0;

      console.log('[admissions/analytics] Processing', total, 'admissions');

      // Calculate overview stats
      const statusCounts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        waitlisted: 0,
        enrolled: 0
      };

      let totalProcessingDays = 0;
      let processedCount = 0;

      admissions?.forEach((admission: Admission) => {
        // Count by status
        const status = admission.status.toLowerCase();
        if (status in statusCounts) {
          statusCounts[status as keyof typeof statusCounts]++;
        }

        // Calculate processing time for approved/rejected
        if (status === 'approved' || status === 'rejected') {
          const created = new Date(admission.created_at);
          const updated = new Date(admission.updated_at);
          const days = Math.floor(
            (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
          );
          totalProcessingDays += days;
          processedCount++;
        }
      });

      const conversionRate =
        total > 0
          ? ((statusCounts.approved + statusCounts.enrolled) / total) * 100
          : 0;

      const avgProcessingDays =
        processedCount > 0 ? totalProcessingDays / processedCount : 0;

      // Calculate admission status breakdown
      const admissionStatusBreakdown = Object.entries(statusCounts).map(
        ([status, count]) => ({
          status,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0
        })
      );

      // Fetch student statuses for combined view using pagination to bypass Supabase 1000 row limit
      let allStudentsData: { status: string }[] = [];
      let hasMoreStudents = true;
      const studentPageSize = 1000;
      let studentPage = 0;

      while (hasMoreStudents) {
        let studentStatusQuery = supabase
          .from('students')
          .select('status');

        // Apply filters
        if (effectiveFilters.institution_id) {
          studentStatusQuery = studentStatusQuery.eq('institution_id', effectiveFilters.institution_id);
        }
        if (effectiveFilters.academic_year_id) {
          studentStatusQuery = studentStatusQuery.eq('academic_year_id', effectiveFilters.academic_year_id);
        }
        if (effectiveFilters.degree_id) {
          studentStatusQuery = studentStatusQuery.eq('degree_id', effectiveFilters.degree_id);
        }
        if (effectiveFilters.department_id) {
          studentStatusQuery = studentStatusQuery.eq('department_id', effectiveFilters.department_id);
        }
        if (effectiveFilters.program_id) {
          studentStatusQuery = studentStatusQuery.eq('program_id', effectiveFilters.program_id);
        }

        // Apply pagination at the end
        studentStatusQuery = studentStatusQuery.range(
          studentPage * studentPageSize,
          (studentPage + 1) * studentPageSize - 1
        );

        const { data: pageData, error: pageError } = await studentStatusQuery;

        if (pageError) {
          console.error('[admissions/analytics] Error fetching students page:', pageError);
          break;
        }

        if (pageData && pageData.length > 0) {
          allStudentsData = allStudentsData.concat(pageData);
          studentPage++;

          // If we got less than page size, we've reached the end
          if (pageData.length < studentPageSize) {
            hasMoreStudents = false;
          }
        } else {
          hasMoreStudents = false;
        }
      }

      const studentsData = allStudentsData;
      const studentsError = null;

      console.log('[admissions/analytics] Total students fetched with pagination:', studentsData.length, 'pages:', studentPage);

      // Calculate student status counts
      const studentStatusCounts: Record<string, number> = {
        active: 0,
        inactive: 0,
        graduated: 0,
        dropped: 0,
        suspended: 0
      };

      if (!studentsError && studentsData) {
        studentsData.forEach((student: { status: string }) => {
          const status = student.status?.toLowerCase() || 'active';
          if (status in studentStatusCounts) {
            studentStatusCounts[status]++;
          } else {
            // Handle any other status
            studentStatusCounts[status] = (studentStatusCounts[status] || 0) + 1;
          }
        });
      }

      const totalStudentsCount = studentsData?.length || 0;

      const studentStatusBreakdown = Object.entries(studentStatusCounts).map(
        ([status, count]) => ({
          status,
          count,
          percentage: totalStudentsCount > 0 ? (count / totalStudentsCount) * 100 : 0
        })
      );

      // Combined status breakdown
      const statusBreakdown = {
        admissionStatuses: admissionStatusBreakdown,
        studentStatuses: studentStatusBreakdown,
        totalAdmissions: total,
        totalStudents: totalStudentsCount
      };

      // Calculate demographics
      const genderCounts: Record<string, number> = {};
      const religionCounts: Record<string, number> = {};
      const communityCounts: Record<string, number> = {};
      const firstGraduateCounts = { 'First Graduate': 0, Regular: 0 };

      admissions?.forEach((admission: Admission) => {
        genderCounts[admission.gender] =
          (genderCounts[admission.gender] || 0) + 1;
        religionCounts[admission.religion] =
          (religionCounts[admission.religion] || 0) + 1;
        communityCounts[admission.community] =
          (communityCounts[admission.community] || 0) + 1;
        if (admission.first_graduate) {
          firstGraduateCounts['First Graduate']++;
        } else {
          firstGraduateCounts['Regular']++;
        }
      });

      const demographics = {
        gender: Object.entries(genderCounts).map(([label, count]) => ({
          label,
          count
        })),
        religion: Object.entries(religionCounts).map(([label, count]) => ({
          label,
          count
        })),
        community: Object.entries(communityCounts).map(([label, count]) => ({
          label,
          count
        })),
        firstGraduate: Object.entries(firstGraduateCounts).map(
          ([label, count]) => ({ label, count })
        )
      };

      // Calculate academic performance
      const tenthMarksRanges = {
        '0-50': 0,
        '51-60': 0,
        '61-70': 0,
        '71-80': 0,
        '81-90': 0,
        '91-100': 0
      };
      const twelfthMarksRanges = {
        '0-50': 0,
        '51-60': 0,
        '61-70': 0,
        '71-80': 0,
        '81-90': 0,
        '91-100': 0
      };
      const neetScoreRanges = {
        '0-200': 0,
        '201-300': 0,
        '301-400': 0,
        '401-500': 0,
        '501-600': 0,
        '601-720': 0
      };

      let totalTenth = 0;
      let totalTwelfth = 0;
      let totalNeet = 0;
      let neetCount = 0;

      admissions?.forEach((admission: Admission) => {
        // Tenth marks
        const tenthPct = parseFloat(admission.tenth_marks.percentage);
        if (!isNaN(tenthPct)) {
          totalTenth += tenthPct;
          if (tenthPct <= 50) tenthMarksRanges['0-50']++;
          else if (tenthPct <= 60) tenthMarksRanges['51-60']++;
          else if (tenthPct <= 70) tenthMarksRanges['61-70']++;
          else if (tenthPct <= 80) tenthMarksRanges['71-80']++;
          else if (tenthPct <= 90) tenthMarksRanges['81-90']++;
          else tenthMarksRanges['91-100']++;
        }

        // Twelfth marks
        const twelfthPct = parseFloat(admission.twelfth_marks.percentage);
        if (!isNaN(twelfthPct)) {
          totalTwelfth += twelfthPct;
          if (twelfthPct <= 50) twelfthMarksRanges['0-50']++;
          else if (twelfthPct <= 60) twelfthMarksRanges['51-60']++;
          else if (twelfthPct <= 70) twelfthMarksRanges['61-70']++;
          else if (twelfthPct <= 80) twelfthMarksRanges['71-80']++;
          else if (twelfthPct <= 90) twelfthMarksRanges['81-90']++;
          else twelfthMarksRanges['91-100']++;
        }

        // NEET score
        if (admission.neet_score) {
          const neetScore = parseFloat(String(admission.neet_score));
          if (!isNaN(neetScore)) {
            totalNeet += neetScore;
            neetCount++;
            if (neetScore <= 200) neetScoreRanges['0-200']++;
            else if (neetScore <= 300) neetScoreRanges['201-300']++;
            else if (neetScore <= 400) neetScoreRanges['301-400']++;
            else if (neetScore <= 500) neetScoreRanges['401-500']++;
            else if (neetScore <= 600) neetScoreRanges['501-600']++;
            else neetScoreRanges['601-720']++;
          }
        }
      });

      const academicPerformance = {
        tenthMarksDistribution: Object.entries(tenthMarksRanges).map(
          ([range, count]) => ({ range, count })
        ),
        twelfthMarksDistribution: Object.entries(twelfthMarksRanges).map(
          ([range, count]) => ({ range, count })
        ),
        neetScoreDistribution: Object.entries(neetScoreRanges).map(
          ([range, count]) => ({ range, count })
        ),
        averageMarks: {
          tenth: total > 0 ? Math.round((totalTenth / total) * 100) / 100 : 0,
          twelfth:
            total > 0 ? Math.round((totalTwelfth / total) * 100) / 100 : 0,
          neet:
            neetCount > 0
              ? Math.round((totalNeet / neetCount) * 100) / 100
              : null
        }
      };

      // Calculate institution distribution (with joins for names)
      const institutionCounts: Record<string, number> = {};
      const degreeCounts: Record<string, number> = {};
      const departmentCounts: Record<string, number> = {};
      const programCounts: Record<string, number> = {};

      // Use Set to get unique IDs for lookup
      const institutionIds = new Set<string>();
      const degreeIds = new Set<string>();
      const departmentIds = new Set<string>();
      const programIds = new Set<string>();

      admissions?.forEach((admission: Admission) => {
        if (admission.institution_id)
          institutionIds.add(admission.institution_id);
        if (admission.degree_id) degreeIds.add(admission.degree_id);
        if (admission.department_id) departmentIds.add(admission.department_id);
        if (admission.program_id) programIds.add(admission.program_id);
      });

      // Fetch names for institutions, degrees, departments, programs
      const [institutions, degrees, departments, programs] = await Promise.all([
        institutionIds.size > 0
          ? (this.supabase as any)
              .from('institutions')
              .select('id, name')
              .in('id', Array.from(institutionIds))
          : { data: [] },
        degreeIds.size > 0
          ? (this.supabase as any)
              .from('degrees')
              .select('id, degree_name')
              .in('id', Array.from(degreeIds))
          : { data: [] },
        departmentIds.size > 0
          ? (this.supabase as any)
              .from('departments')
              .select('id, department_name')
              .in('id', Array.from(departmentIds))
          : { data: [] },
        programIds.size > 0
          ? (this.supabase as any)
              .from('programs')
              .select('id, program_name')
              .in('id', Array.from(programIds))
          : { data: [] }
      ]);

      // Create lookup maps
      const institutionMap = new Map(
        institutions.data?.map((i) => [i.id, i.name])
      );
      const degreeMap = new Map(
        degrees.data?.map((d) => [d.id, d.degree_name])
      );
      const departmentMap = new Map(
        departments.data?.map((d) => [d.id, d.department_name])
      );
      const programMap = new Map(
        programs.data?.map((p) => [p.id, p.program_name])
      );

      // Count by names
      admissions?.forEach((admission: Admission) => {
        if (admission.institution_id) {
          const name = (institutionMap.get(admission.institution_id) ||
            'Unknown') as string;
          institutionCounts[name] = (institutionCounts[name] || 0) + 1;
        }
        if (admission.degree_id) {
          const name = (degreeMap.get(admission.degree_id) ||
            'Unknown') as string;
          degreeCounts[name] = (degreeCounts[name] || 0) + 1;
        }
        if (admission.department_id) {
          const name = (departmentMap.get(admission.department_id) ||
            'Unknown') as string;
          departmentCounts[name] = (departmentCounts[name] || 0) + 1;
        }
        if (admission.program_id) {
          const name = (programMap.get(admission.program_id) ||
            'Unknown') as string;
          programCounts[name] = (programCounts[name] || 0) + 1;
        }
      });

      const institutionDistribution = {
        institutions: Object.entries(institutionCounts)
          .map(([name, count]) => ({
            name,
            count,
            percentage: total > 0 ? (count / total) * 100 : 0
          }))
          .sort((a, b) => b.count - a.count),
        degrees: Object.entries(degreeCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        departments: Object.entries(departmentCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        programs: Object.entries(programCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
      };

      // Calculate geographic distribution
      const stateCounts: Record<string, number> = {};
      const districtCounts: Record<string, number> = {};

      admissions?.forEach((admission: Admission) => {
        const state = admission.permanent_address_state;
        const district = admission.permanent_address_district;

        stateCounts[state] = (stateCounts[state] || 0) + 1;
        districtCounts[district] = (districtCounts[district] || 0) + 1;
      });

      const geographic = {
        states: Object.entries(stateCounts)
          .map(([state, count]) => ({ state, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        districts: Object.entries(districtCounts)
          .map(([district, count]) => ({ district, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        topLocations: Object.entries(districtCounts)
          .map(([location, count]) => ({ location, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      };

      // Calculate reference sources
      const referenceCounts: Record<string, number> = {};
      admissions?.forEach((admission: Admission) => {
        const type = admission.reference_type || 'Direct';
        referenceCounts[type] = (referenceCounts[type] || 0) + 1;
      });

      const referenceSources = Object.entries(referenceCounts).map(
        ([type, count]) => ({
          type,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0
        })
      );

      // Calculate time trends
      const dailyCounts: Record<
        string,
        { count: number; approved: number; rejected: number }
      > = {};
      const monthlyCounts: Record<string, number> = {};

      admissions?.forEach((admission: Admission) => {
        const date = new Date(admission.created_at);
        const dateKey = date.toISOString().split('T')[0];
        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, '0')}`;

        if (!dailyCounts[dateKey]) {
          dailyCounts[dateKey] = { count: 0, approved: 0, rejected: 0 };
        }
        dailyCounts[dateKey].count++;
        if (admission.status === 'approved') dailyCounts[dateKey].approved++;
        if (admission.status === 'rejected') dailyCounts[dateKey].rejected++;

        monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
      });

      const timeTrends = {
        daily: Object.entries(dailyCounts)
          .map(([date, data]) => ({ date, ...data }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        monthly: Object.entries(monthlyCounts)
          .map(([month, count]) => ({ month, count }))
          .sort((a, b) => a.month.localeCompare(b.month)),
        peakPeriods: Object.entries(monthlyCounts)
          .map(([period, count]) => ({ period, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      };

      // Use combined overview from database function, with fallback to calculated values
      const overview = combinedOverview
        ? {
            // Combined totals from database
            combinedTotal: combinedOverview.combinedTotal || 0,
            totalAdmissions: combinedOverview.totalAdmissions || 0,
            totalStudents: combinedOverview.totalStudents || 0,

            // Pipeline statuses
            pending: combinedOverview.pending || 0,
            approved: combinedOverview.approved || 0,
            rejected: combinedOverview.rejected || 0,
            waitlisted: combinedOverview.waitlisted || 0,
            enrolled: combinedOverview.enrolled || 0,

            // Student data
            onboarded: combinedOverview.onboarded || 0,
            directStudents: combinedOverview.directStudents || 0,
            pendingProfile: combinedOverview.pendingProfile || 0,

            // Rates
            conversionRate: combinedOverview.conversionRate || 0,
            onboardingRate: combinedOverview.onboardingRate || 0,
            avgProcessingDays: combinedOverview.avgProcessingDays || 0
          }
        : {
            // Fallback to old calculation if RPC fails
            combinedTotal: total,
            totalAdmissions: total,
            totalStudents: 0,
            pending: statusCounts.pending,
            approved: statusCounts.approved,
            rejected: statusCounts.rejected,
            waitlisted: statusCounts.waitlisted,
            enrolled: statusCounts.enrolled,
            onboarded: 0,
            directStudents: 0,
            pendingProfile: 0,
            conversionRate: Math.round(conversionRate * 100) / 100,
            onboardingRate: 0,
            avgProcessingDays: Math.round(avgProcessingDays * 100) / 100
          };

      return {
        overview,
        statusBreakdown,
        demographics,
        academicPerformance,
        institutionDistribution,
        geographic,
        referenceSources,
        timeTrends,
        metadata: {
          totalRecords: overview.combinedTotal,
          dateRange: {
            from: effectiveFilters.dateRange?.from?.toISOString() || '',
            to: effectiveFilters.dateRange?.to?.toISOString() || ''
          },
          lastUpdated: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(
        '[admissions/analytics] Error fetching dashboard analytics:',
        error
      );
      throw error;
    }
  }
}
