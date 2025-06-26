import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  TimetableLeave,
  CreateTimetableLeaveDto,
  UpdateTimetableLeaveDto,
  TimetableLeaveFilters,
  TimetableLeaveListResponse,
  DayLeaveStatus,
  DayOrderShiftConfig
} from '@/types/academics';

export class TimetableLeaveService {
  private static supabase = createClientSupabaseClient();

  static async createLeave(
    data: CreateTimetableLeaveDto
  ): Promise<TimetableLeave> {
    try {
      // Get current user
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const { data: leave, error } = await this.supabase
        .from('timetable_leaves')
        .insert([
          {
            ...data,
            is_active: data.is_active !== undefined ? data.is_active : true,
            created_by: user.id
          }
        ])
        .select(
          `
          *,
          timetable:timetable_id(
            id,
            timetable_name,
            institution:institution_id(
              id,
              name,
              timetable_type
            )
          ),
          created_by_user:created_by(id, email)
        `
        )
        .single();

      if (error) throw error;

      toast.success('Leave marked successfully');
      return leave;
    } catch (error) {
      console.error('Error creating leave:', error);
      toast.error('Failed to mark leave');
      throw error;
    }
  }

  static async updateLeave(
    id: string,
    data: UpdateTimetableLeaveDto
  ): Promise<TimetableLeave> {
    try {
      const { data: leave, error } = await this.supabase
        .from('timetable_leaves')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(
          `
          *,
          timetable:timetable_id(
            id,
            timetable_name,
            institution:institution_id(
              id,
              name,
              timetable_type
            )
          ),
          created_by_user:created_by(id, email)
        `
        )
        .single();

      if (error) throw error;

      toast.success('Leave updated successfully');
      return leave;
    } catch (error) {
      console.error('Error updating leave:', error);
      toast.error('Failed to update leave');
      throw error;
    }
  }

  static async deleteLeave(id: string): Promise<void> {
    try {
      // Get the leave details first to check if we need to clean up shifts
      const { data: leave } = await this.supabase
        .from('timetable_leaves')
        .select('timetable_id, leave_date')
        .eq('id', id)
        .single();

      if (leave) {
        // Delete related day order shifts if any
        await this.supabase
          .from('timetable_day_order_shifts')
          .delete()
          .eq('timetable_id', leave.timetable_id)
          .eq('original_date', leave.leave_date);
      }

      // Delete the leave
      const { error } = await this.supabase
        .from('timetable_leaves')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Leave removed successfully');
    } catch (error) {
      console.error('Error deleting leave:', error);
      toast.error('Failed to remove leave');
      throw error;
    }
  }

  static async getLeaves(
    filters: TimetableLeaveFilters = {}
  ): Promise<TimetableLeaveListResponse> {
    try {
      let query = this.supabase.from('timetable_leaves').select(
        `
          *,
          timetable:timetable_id(
            id,
            timetable_name,
            institution:institution_id(
              id,
              name,
              timetable_type
            )
          ),
          created_by_user:created_by(id, email)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.timetable_id) {
        query = query.eq('timetable_id', filters.timetable_id);
      }

      if (filters.leave_date) {
        query = query.eq('leave_date', filters.leave_date);
      }

      if (filters.leave_type) {
        query = query.eq('leave_type', filters.leave_type);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.start_date && filters.end_date) {
        query = query
          .gte('leave_date', filters.start_date)
          .lte('leave_date', filters.end_date);
      } else if (filters.start_date) {
        query = query.gte('leave_date', filters.start_date);
      } else if (filters.end_date) {
        query = query.lte('leave_date', filters.end_date);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

      // Order by leave_date descending
      query = query.order('leave_date', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching leaves:', error);
      throw error;
    }
  }

  static async getLeave(id: string): Promise<TimetableLeave> {
    try {
      const { data: leave, error } = await this.supabase
        .from('timetable_leaves')
        .select(
          `
          *,
          timetable:timetable_id(
            id,
            timetable_name,
            institution:institution_id(
              id,
              name,
              timetable_type
            )
          ),
          created_by_user:created_by(id, email)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return leave;
    } catch (error) {
      console.error('Error fetching leave:', error);
      throw error;
    }
  }

  static async getLeavesByDateRange(
    timetableId: string,
    startDate: string,
    endDate: string
  ): Promise<DayLeaveStatus[]> {
    try {
      const { data: leaves, error } = await this.supabase
        .from('timetable_leaves')
        .select('*')
        .eq('timetable_id', timetableId)
        .eq('is_active', true)
        .gte('leave_date', startDate)
        .lte('leave_date', endDate)
        .order('leave_date');

      if (error) throw error;

      // Convert to DayLeaveStatus array
      const leaveStatuses: DayLeaveStatus[] = [];
      const currentDate = new Date(startDate);
      const endDateObj = new Date(endDate);

      while (currentDate <= endDateObj) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const leave = leaves?.find((l) => l.leave_date === dateStr);

        leaveStatuses.push({
          date: dateStr,
          is_leave: !!leave,
          leave_type: leave?.leave_type,
          reason: leave?.reason,
          leave_id: leave?.id
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return leaveStatuses;
    } catch (error) {
      console.error('Error fetching leaves by date range:', error);
      throw error;
    }
  }

  static async getDayOrderShifts(
    timetableId: string
  ): Promise<DayOrderShiftConfig[]> {
    try {
      const { data: shifts, error } = await this.supabase
        .from('timetable_day_order_shifts')
        .select('*')
        .eq('timetable_id', timetableId)
        .order('original_date');

      if (error) throw error;

      return shifts || [];
    } catch (error) {
      console.error('Error fetching day order shifts:', error);
      throw error;
    }
  }

  static async getInstitutionTimetableType(
    timetableId: string
  ): Promise<'day_order' | 'week_order'> {
    try {
      const { data, error } = await this.supabase
        .from('timetables')
        .select(
          `
          institution:institution_id(
            timetable_type
          )
        `
        )
        .eq('id', timetableId)
        .single();

      if (error) throw error;

      return (data as any)?.institution?.timetable_type || 'week_order';
    } catch (error) {
      console.error('Error fetching institution timetable type:', error);
      return 'week_order'; // Default fallback
    }
  }

  static async isDateAvailable(
    timetableId: string,
    date: string
  ): Promise<boolean> {
    try {
      const { data: leaves, error } = await this.supabase
        .from('timetable_leaves')
        .select('id')
        .eq('timetable_id', timetableId)
        .eq('leave_date', date)
        .eq('is_active', true);

      if (error) throw error;

      return !leaves || leaves.length === 0;
    } catch (error) {
      console.error('Error checking date availability:', error);
      return false;
    }
  }

  static async bulkCreateLeaves(leaves: CreateTimetableLeaveDto[]): Promise<{
    success: TimetableLeave[];
    failed: { data: CreateTimetableLeaveDto; error: string }[];
  }> {
    const success: TimetableLeave[] = [];
    const failed: { data: CreateTimetableLeaveDto; error: string }[] = [];

    // Process leaves sequentially to handle day order shifts properly
    for (const leaveData of leaves) {
      try {
        const leave = await this.createLeave(leaveData);
        success.push(leave);
      } catch (error) {
        console.error(
          `Error creating leave for ${leaveData.leave_date}:`,
          error
        );
        failed.push({
          data: leaveData,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  static async toggleLeaveStatus(id: string): Promise<TimetableLeave> {
    try {
      // Get current leave status
      const { data: currentLeave, error: fetchError } = await this.supabase
        .from('timetable_leaves')
        .select('is_active')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Toggle the status
      const newStatus = !currentLeave.is_active;

      return await this.updateLeave(id, { is_active: newStatus });
    } catch (error) {
      console.error('Error toggling leave status:', error);
      throw error;
    }
  }
}
