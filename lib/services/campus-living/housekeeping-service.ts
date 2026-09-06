import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Local types (tables: hostel_cleaning_schedules, hostel_cleaning_tasks) ─
// Schema-of-truth (prod, verified 2026-05-19 via information_schema):
//   hostel_cleaning_schedules columns: id, institution_id, block_id, floor_number,
//     cleaning_type (enum cleaning_type_enum), frequency (enum), scheduled_time,
//     assigned_staff, assigned_staff_phone, checklist (jsonb), is_active,
//     created_at, updated_at
//   hostel_cleaning_tasks columns: id, institution_id, schedule_id, block_id,
//     floor_number, date, cleaning_type (enum), assigned_staff,
//     status (enum cleaning_task_status_enum), started_at, completed_at,
//     completed_by, quality_rating, inspector_notes, photo_urls[], created_at,
//     updated_at
// Type drift fixed: removed `area`/`cadence`/`next_due_at`/`assigned_to` (never
// existed in prod); added `cleaning_type`/`frequency` and the rest of the real
// columns; tightened enum unions.

export type CleaningType =
  | 'daily_sweep'
  | 'daily_mop'
  | 'toilet_cleaning'
  | 'common_area'
  | 'deep_cleaning'
  | 'window_cleaning'
  | 'water_tank'
  | 'disinfection'
  | 'other';

// Mirrors pm_frequency_enum (verified in prod 2026-06-11).
export type CleaningFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly';

export type CleaningTaskStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'missed'
  | 'rescheduled';

export interface HostelCleaningSchedule {
  id: string;
  institution_id: string;
  block_id?: string | null;
  floor_number?: number | null;
  cleaning_type: CleaningType | string;
  frequency: CleaningFrequency | string;
  scheduled_time?: string | null;
  assigned_staff?: string | null;
  assigned_staff_phone?: string | null;
  checklist?: unknown | null;
  is_active?: boolean | null;
  created_at: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface HostelCleaningTask {
  id: string;
  institution_id: string;
  schedule_id: string;
  block_id?: string | null;
  floor_number?: number | null;
  date: string;
  cleaning_type: CleaningType | string;
  assigned_staff?: string | null;
  status: CleaningTaskStatus | string;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  quality_rating?: number | null;
  inspector_notes?: string | null;
  photo_urls?: string[] | null;
  created_at: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface ScheduleFilters {
  block_id?: string;
  is_active?: boolean;
  // Date range filter applied on `created_at`. (Previously documented/queried
  // against `next_due_at`, a column that has never existed in prod — any use
  // of the date filters 42703'd the whole list.)
  // Format: ISO timestamp string (e.g. `2026-05-19T00:00:00Z`).
  date_from?: string;
  date_to?: string;
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
      if (filters?.date_from) query = query.gte('created_at', filters.date_from);
      if (filters?.date_to) query = query.lte('created_at', filters.date_to);

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

  /**
   * Move a generated cleaning task along its lifecycle. No RPC needed — the
   * hostel_cleaning_tasks UPDATE policy already gates on
   * campus_living.housekeeping.mark_done OR .schedule + institution access,
   * so RLS is the enforcement point and a denial surfaces in `error`.
   * started_at / completed_at are stamped here so the timeline is filled in
   * whichever way the status is reached.
   */
  static async updateTaskStatus(id: string, status: CleaningTaskStatus) {
    try {
      const supabase = createClientSupabaseClient();
      const patch: Record<string, unknown> = { status };
      if (status === 'in_progress') patch.started_at = new Date().toISOString();
      if (status === 'completed') patch.completed_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('hostel_cleaning_tasks')
        .update(patch as never)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to update task status', error);
        throw error;
      }
      return data as HostelCleaningTask;
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in updateTaskStatus', error);
      throw error;
    }
  }
}
