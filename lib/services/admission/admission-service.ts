import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  Admission,
  AdmissionFilters,
  AdmissionListResponse,
  CreateAdmissionDto,
  UpdateAdmissionDto
} from '@/types/admission';
import { StudentService } from '@/lib/services/student/student-service';
import { toast } from 'sonner';

export class AdmissionService {
  private static supabase = createClientSupabaseClient();

  static async createAdmission(data: CreateAdmissionDto): Promise<Admission> {
    try {
      const { data: admission, error } = await this.supabase
        .from('admissions')
        .insert([
          {
            ...data,
            status: data.status || 'pending',
            created_by: (await this.supabase.auth.getUser()).data.user?.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success('Admission application submitted successfully');
      return admission;
    } catch (error) {
      console.error('Error creating admission:', error);
      toast.error('Failed to submit admission application');
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

      toast.success('Admission application updated successfully');
      return admission;
    } catch (error) {
      console.error('Error updating admission:', error);
      toast.error('Failed to update admission application');
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
          await StudentService.createStudentFromAdmission(id);
          toast.success('Student record created from approved admission');
        } catch (studentError) {
          console.error('Error creating student record:', studentError);
          toast.error('Failed to create student record from admission');
          // We don't throw here to prevent blocking the status update
        }
      }

      toast.success(`Admission status updated to ${status}`);
      return admission;
    } catch (error) {
      console.error('Error updating admission status:', error);
      toast.error('Failed to update admission status');
      throw error;
    }
  }

  static async deleteAdmission(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('admissions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Admission application deleted successfully');
    } catch (error) {
      console.error('Error deleting admission:', error);
      toast.error('Failed to delete admission application');
      throw error;
    }
  }

  static async getAdmissions(
    filters: AdmissionFilters = {}
  ): Promise<AdmissionListResponse> {
    try {
      // Use Supabase's built-in join capabilities
      let query = this.supabase.from('admissions').select(
        `
          *,
          institution:institutions!institution_id(id, name),
          program:programs!program_id(id, program_name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `student_name.ilike.%${filters.search}%,student_email.ilike.%${filters.search}%,student_mobile.ilike.%${filters.search}%`
        );
      }

      if (filters.name) {
        query = query.ilike('student_name', `%${filters.name}%`);
      }

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.institution && filters.institution !== 'all') {
        query = query.eq('field_of_study', filters.institution);
      }

      if (filters.course && filters.course !== 'all') {
        query = query.eq('year_and_branch', filters.course);
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

      if (error) throw error;

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
