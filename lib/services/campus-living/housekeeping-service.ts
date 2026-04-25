import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Local types (tables: hostel_cleaning_schedules, hostel_cleaning_tasks) ─
export interface HostelCleaningSchedule {
  id: string;
  institution_id: string;
  block_id?: string | null;
  area?: string | null;
  cadence?: string | null;
  next_due_at?: string | null;
  assigned_to?: string | null;
  is_active?: boolean | null;
  created_at: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface HostelCleaningTask {
  id: string;
  institution_id?: string | null;
  schedule_id?: string | null;
  block_id?: string | null;
  status: string;
  cleaning_type?: string | null;
  date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  assigned_to?: string | null;
  created_at: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface ScheduleFilters {
  block_id?: string;
  is_active?: boolean;
}

export interface TaskFilters {
  status?: string;
  block_id?: string;
  cleaning_type?: string;
  date_from?: string;
  date_to?: string;
}

export type CreateScheduleDTO = Omit<
  HostelCleaningSchedule,
  'id' | 'created_at' | 'updated_at'
> & { institution_id: string };

export type CreateTaskDTO = Omit<
  HostelCleaningTask,
  'id' | 'created_at' | 'updated_at'
>;

export class HousekeepingService {
  // ── Schedules ──────────────────────────────────────────────────────
  static async getSchedules(
    institutionId: string | undefined,
    filters?: ScheduleFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('hostel_cleaning_schedules')
        .select('*', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch schedules', error);
        throw error;
      }
      return { data: (data ?? []) as HostelCleaningSchedule[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getSchedules', error);
      throw error;
    }
  }

  static async createSchedule(payload: CreateScheduleDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_cleaning_schedules')
        .insert(payload as never)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to create schedule', error);
        throw error;
      }
      return data as HostelCleaningSchedule;
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in createSchedule', error);
      throw error;
    }
  }

  static async updateSchedule(id: string, payload: Partial<HostelCleaningSchedule>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_cleaning_schedules')
        .update(payload as never)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to update schedule', error);
        throw error;
      }
      return data as HostelCleaningSchedule;
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in updateSchedule', error);
      throw error;
    }
  }

  static async deleteSchedule(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_cleaning_schedules')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to delete schedule', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in deleteSchedule', error);
      throw error;
    }
  }

  // ── Tasks ──────────────────────────────────────────────────────────
  static async getTasks(
    institutionId: string | undefined,
    filters?: TaskFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('hostel_cleaning_tasks')
        .select('*', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.cleaning_type) query = query.eq('cleaning_type', filters.cleaning_type);
      if (filters?.date_from) query = query.gte('date', filters.date_from);
      if (filters?.date_to) query = query.lte('date', filters.date_to);

      const from = (page - 1) * pageSize;
      query = query.order('date', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch tasks', error);
        throw error;
      }
      return { data: (data ?? []) as HostelCleaningTask[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getTasks', error);
      throw error;
    }
  }
}
