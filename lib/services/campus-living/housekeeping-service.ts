import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type {
  HostelCleaningSchedule,
  HostelCleaningTask,
  CreateCleaningScheduleDTO,
  CleaningScheduleFilters,
  CleaningTaskFilters,
} from '@/types/campus-living'

export class HousekeepingService {
  // ── List cleaning schedules with filters ──────────────────────────
  static async getSchedules(
    institutionId: string,
    filters?: CleaningScheduleFilters
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_cleaning_schedules')
        .select('*, hostel_blocks(name, code)', { count: 'exact' })
        .eq('institution_id', institutionId)

      if (filters?.block_id) query = query.eq('block_id', filters.block_id)
      if (filters?.cleaning_type) query = query.eq('cleaning_type', filters.cleaning_type)
      if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active)

      query = query.order('cleaning_type', { ascending: true })

      const { data, error, count } = await query
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch schedules', error)
        throw error
      }
      return { data: data as HostelCleaningSchedule[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getSchedules', error)
      throw error
    }
  }

  // ── Single schedule ───────────────────────────────────────────────
  static async getSchedule(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_cleaning_schedules')
        .select('*, hostel_blocks(name, code)')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch schedule', error)
        throw error
      }
      return data as HostelCleaningSchedule & Record<string, unknown>
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getSchedule', error)
      throw error
    }
  }

  // ── Create schedule ───────────────────────────────────────────────
  static async createSchedule(payload: CreateCleaningScheduleDTO) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_cleaning_schedules')
        .insert(payload)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to create schedule', error)
        throw error
      }
      return data as HostelCleaningSchedule
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in createSchedule', error)
      throw error
    }
  }

  // ── Update schedule ───────────────────────────────────────────────
  static async updateSchedule(
    id: string,
    payload: Partial<CreateCleaningScheduleDTO> & { is_active?: boolean }
  ) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_cleaning_schedules')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to update schedule', error)
        throw error
      }
      return data as HostelCleaningSchedule
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in updateSchedule', error)
      throw error
    }
  }

  // ── Delete schedule ───────────────────────────────────────────────
  static async deleteSchedule(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { error } = await (supabase as any)
        .from('hostel_cleaning_schedules')
        .delete()
        .eq('id', id)

      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to delete schedule', error)
        throw error
      }
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in deleteSchedule', error)
      throw error
    }
  }

  // ── List cleaning tasks with filters ──────────────────────────────
  static async getTasks(
    institutionId: string,
    filters?: CleaningTaskFilters
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_cleaning_tasks')
        .select('*, hostel_cleaning_schedules(cleaning_type, frequency), hostel_blocks(name, code)', { count: 'exact' })
        .eq('institution_id', institutionId)

      if (filters?.block_id) query = query.eq('block_id', filters.block_id)
      if (filters?.schedule_id) query = query.eq('schedule_id', filters.schedule_id)
      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.date) query = query.eq('date', filters.date)
      if (filters?.date_from) query = query.gte('date', filters.date_from)
      if (filters?.date_to) query = query.lte('date', filters.date_to)

      query = query.order('date', { ascending: false })

      const { data, error, count } = await query
      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch tasks', error)
        throw error
      }
      return { data: data as HostelCleaningTask[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getTasks', error)
      throw error
    }
  }

  // ── Tasks for a specific date ─────────────────────────────────────
  static async getTasksByDate(institutionId: string, date: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_cleaning_tasks')
        .select('*, hostel_cleaning_schedules(cleaning_type, frequency), hostel_blocks(name, code)')
        .eq('institution_id', institutionId)
        .eq('date', date)
        .order('block_id', { ascending: true })
        .order('cleaning_type', { ascending: true })

      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch tasks by date', error)
        throw error
      }
      return data as HostelCleaningTask[]
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getTasksByDate', error)
      throw error
    }
  }

  // ── Create a task instance ────────────────────────────────────────
  static async createTask(payload: {
    institution_id: string
    schedule_id: string
    block_id?: string
    floor_number?: number
    date: string
    cleaning_type: string
    assigned_staff?: string
  }) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_cleaning_tasks')
        .insert({
          ...payload,
          status: 'scheduled',
        })
        .select()
        .single()

      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to create task', error)
        throw error
      }
      return data as HostelCleaningTask
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in createTask', error)
      throw error
    }
  }

  // ── Update task status ────────────────────────────────────────────
  static async updateTaskStatus(
    id: string,
    status: string,
    completedBy?: string,
    qualityRating?: number,
    inspectorNotes?: string
  ) {
    try {
      const supabase = createClientSupabaseClient()

      const updatePayload: Record<string, unknown> = { status }

      if (status === 'in_progress') {
        updatePayload.started_at = new Date().toISOString()
      }

      if (status === 'completed') {
        updatePayload.completed_at = new Date().toISOString()
        if (completedBy) updatePayload.completed_by = completedBy
      }

      if (qualityRating !== undefined) updatePayload.quality_rating = qualityRating
      if (inspectorNotes !== undefined) updatePayload.inspector_notes = inspectorNotes

      const { data, error } = await (supabase as any)
        .from('hostel_cleaning_tasks')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to update task status', error)
        throw error
      }
      return data as HostelCleaningTask
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in updateTaskStatus', error)
      throw error
    }
  }

  // ── Today's stats by status ───────────────────────────────────────
  static async getTodayStats(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient()
      const today = new Date().toISOString().split('T')[0]

      const { data, error } = await (supabase as any)
        .from('hostel_cleaning_tasks')
        .select('status')
        .eq('institution_id', institutionId)
        .eq('date', today)

      if (error) {
        logger.error('campus-living/housekeeping', 'Failed to fetch today stats', error)
        throw error
      }

      const stats = {
        scheduled: 0,
        in_progress: 0,
        completed: 0,
        missed: 0,
      }

      for (const task of (data ?? []) as { status: string }[]) {
        if (task.status in stats) {
          stats[task.status as keyof typeof stats]++
        }
      }

      return stats
    } catch (error) {
      logger.error('campus-living/housekeeping', 'Unexpected error in getTodayStats', error)
      throw error
    }
  }
}
