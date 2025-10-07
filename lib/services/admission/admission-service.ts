import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  Admission,
  AdmissionFilters,
  AdmissionListResponse,
  CreateAdmissionDto,
  UpdateAdmissionDto
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
    const { data, error } = await this.supabase
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
      const lastId = data[0].application_id;
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

      const { data: admission, error } = await this.supabase
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

      return admission;
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
      const { data: draft, error: draftError } = await this.supabase
        .from('admissions')
        .select('application_id')
        .eq('id', draftId)
        .eq('status', 'draft')
        .single();

      if (draftError) throw draftError;

      // Update the draft to final status instead of creating new record
      const { data: admission, error } = await this.supabase
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

      return admission;
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

      const { data: admission, error } = await this.supabase
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

      return admission;
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
      const { data: admission, error } = await this.supabase
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

      return admission;
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
      const { data: admission, error } = await this.supabase
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

      return admission;
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
      const { data: admission, error } = await this.supabase
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
          const { data: existingStudent } = await this.supabase
            .from('students')
            .select('id')
            .eq('admission_id', id)
            .maybeSingle();

          if (existingStudent) {
            console.log('Student record already exists for this admission');
            toast.success('Student record already exists in onboarding module');
          } else {
            // Fetch the admission to ensure we have all data
            const { data: fullAdmission } = await this.supabase
              .from('admissions')
              .select('*')
              .eq('id', id)
              .single();

            if (fullAdmission) {
              // Create student record in a non-blocking way
              const student = await StudentService.createStudentFromAdmission(
                id
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

      return admission;
    } catch (error) {
      console.error('Error updating admission status:', error);
      toast.error('Failed to update admission status');
      throw error;
    }
  }

  static async deleteAdmission(id: string): Promise<void> {
    try {
      // First check if admission has associated student record
      const { data: studentCheck } = await this.supabase
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

      const { error } = await this.supabase
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
      const { data: studentsCheck, error: checkError } = await this.supabase
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
        const { error } = await this.supabase
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

  static async getAdmissions(
    filters: AdmissionFilters = {}
  ): Promise<AdmissionListResponse> {
    try {
      console.log(
        'AdmissionService.getAdmissions called with filters:',
        filters
      );

      // Use Supabase's built-in join capabilities
      let query = this.supabase.from('admissions').select(
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
      const { data: admission, error } = await this.supabase
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

      return admission;
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
      const { count: total, error: totalError } = await this.supabase
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
          const { count, error } = await this.supabase
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
}
