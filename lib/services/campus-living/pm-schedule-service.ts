import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type {
  HostelPmSchedule,
  CreatePmScheduleDTO,
  PmScheduleFilters,
  HostelPmTask,
  CompletePmTaskDTO,
  PmTaskFilters,
  PmChecklistItem,
  PmFrequency,
} from '@/types/campus-living'

export class PmScheduleService {
  // ── List PM schedules with filters ──────────────────────────────────
  static async getSchedules(
    institutionId: string,
    filters?: PmScheduleFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = supabase
        .from('hostel_pm_schedules')
        .select('*, hostel_blocks(name, code)', { count: 'exact' })
        .eq('institution_id', institutionId)

      if (filters?.block_id) query = query.eq('block_id', filters.block_id)
      if (filters?.category) query = query.eq('category', filters.category)
      if (filters?.status) query = query.eq('status', filters.status)

      const from = (page - 1) * pageSize
      query = query.order('next_due_date', { ascending: true }).range(from, from + pageSize - 1)

      const { data, error, count } = await query
      if (error) {
        logger.error('campus-living/pm-schedule', 'Failed to fetch schedules', error)
        throw error
      }
      return { data: data as HostelPmSchedule[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in getSchedules', error)
      throw error
    }
  }

  // ── Single schedule ─────────────────────────────────────────────────
  static async getSchedule(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await supabase
        .from('hostel_pm_schedules')
        .select('*, hostel_blocks(name, code)')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('campus-living/pm-schedule', 'Failed to fetch schedule', error)
        throw error
      }
      return data as HostelPmSchedule & Record<string, unknown>
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in getSchedule', error)
      throw error
    }
  }

  // ── Create schedule ─────────────────────────────────────────────────
  static async createSchedule(payload: CreatePmScheduleDTO) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await supabase
        .from('hostel_pm_schedules')
        .insert(payload)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/pm-schedule', 'Failed to create schedule', error)
        throw error
      }
      return data as HostelPmSchedule
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in createSchedule', error)
      throw error
    }
  }

  // ── Update schedule ─────────────────────────────────────────────────
  static async updateSchedule(id: string, payload: Partial<HostelPmSchedule>) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await supabase
        .from('hostel_pm_schedules')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/pm-schedule', 'Failed to update schedule', error)
        throw error
      }
      return data as HostelPmSchedule
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in updateSchedule', error)
      throw error
    }
  }

  // ── Delete schedule ─────────────────────────────────────────────────
  static async deleteSchedule(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { error } = await supabase
        .from('hostel_pm_schedules')
        .delete()
        .eq('id', id)

      if (error) {
        logger.error('campus-living/pm-schedule', 'Failed to delete schedule', error)
        throw error
      }
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in deleteSchedule', error)
      throw error
    }
  }

  // ── Pause schedule ──────────────────────────────────────────────────
  static async pauseSchedule(id: string) {
    try {
      return await this.updateSchedule(id, { status: 'paused' })
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in pauseSchedule', error)
      throw error
    }
  }

  // ── Resume schedule ─────────────────────────────────────────────────
  static async resumeSchedule(id: string) {
    try {
      return await this.updateSchedule(id, { status: 'active' })
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in resumeSchedule', error)
      throw error
    }
  }

  // ── List PM tasks with filters ──────────────────────────────────────
  static async getTasks(
    institutionId: string,
    filters?: PmTaskFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = supabase
        .from('hostel_pm_tasks')
        .select('*, hostel_pm_schedules(title), hostel_blocks(name, code)', { count: 'exact' })
        .eq('institution_id', institutionId)

      if (filters?.schedule_id) query = query.eq('schedule_id', filters.schedule_id)
      if (filters?.block_id) query = query.eq('block_id', filters.block_id)
      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.due_from) query = query.gte('due_date', filters.due_from)
      if (filters?.due_to) query = query.lte('due_date', filters.due_to)

      if (filters?.overdue_only) {
        const today = new Date().toISOString().split('T')[0]
        query = query.lt('due_date', today).eq('status', 'open')
      }

      const from = (page - 1) * pageSize
      query = query.order('due_date', { ascending: true }).range(from, from + pageSize - 1)

      const { data, error, count } = await query
      if (error) {
        logger.error('campus-living/pm-schedule', 'Failed to fetch tasks', error)
        throw error
      }
      return { data: data as HostelPmTask[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in getTasks', error)
      throw error
    }
  }

  // ── Single task ─────────────────────────────────────────────────────
  static async getTask(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await supabase
        .from('hostel_pm_tasks')
        .select('*, hostel_pm_schedules(title), hostel_blocks(name, code)')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('campus-living/pm-schedule', 'Failed to fetch task', error)
        throw error
      }
      return data as HostelPmTask & Record<string, unknown>
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in getTask', error)
      throw error
    }
  }

  // ── Generate next task from schedule ────────────────────────────────
  static async generateNextTask(scheduleId: string) {
    try {
      const schedule = await this.getSchedule(scheduleId)

      const supabase = createClientSupabaseClient()
      const { data, error } = await supabase
        .from('hostel_pm_tasks')
        .insert({
          institution_id: schedule.institution_id,
          schedule_id: schedule.id,
          block_id: schedule.block_id,
          due_date: schedule.next_due_date,
          title: schedule.title,
          category: schedule.category,
          priority: schedule.priority,
          assigned_to_name: schedule.assigned_to_name,
          assigned_to_phone: schedule.assigned_to_phone,
          checklist: schedule.checklist,
          status: 'open',
        })
        .select()
        .single()

      if (error) {
        logger.error('campus-living/pm-schedule', 'Failed to generate next task', error)
        throw error
      }
      return data as HostelPmTask
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in generateNextTask', error)
      throw error
    }
  }

  // ── Complete a task and advance schedule ─────────────────────────────
  static async completeTask(id: string, completedBy: string, payload: CompletePmTaskDTO) {
    try {
      const supabase = createClientSupabaseClient()

      // Update the task as resolved
      const { data: task, error: taskError } = await supabase
        .from('hostel_pm_tasks')
        .update({
          status: 'resolved',
          completed_by: completedBy,
          completed_at: new Date().toISOString(),
          completion_notes: payload.completion_notes,
          photo_urls: payload.photo_urls ?? null,
          cost_actual: payload.cost_actual ?? null,
          checklist: payload.checklist ?? null,
        })
        .eq('id', id)
        .select('*, hostel_pm_schedules(frequency, next_due_date, total_completions)')
        .single()

      if (taskError) {
        logger.error('campus-living/pm-schedule', 'Failed to complete task', taskError)
        throw taskError
      }

      // Advance the parent schedule
      const scheduleData = (task as Record<string, unknown>).hostel_pm_schedules as {
        frequency: PmFrequency
        next_due_date: string
        total_completions: number
      } | null

      if (scheduleData && task.schedule_id) {
        const nextDueDate = this.calculateNextDueDate(
          scheduleData.next_due_date,
          scheduleData.frequency
        )

        const { error: scheduleError } = await supabase
          .from('hostel_pm_schedules')
          .update({
            last_completed_date: new Date().toISOString().split('T')[0],
            total_completions: (scheduleData.total_completions ?? 0) + 1,
            next_due_date: nextDueDate,
          })
          .eq('id', task.schedule_id)

        if (scheduleError) {
          logger.error('campus-living/pm-schedule', 'Failed to update schedule after task completion', scheduleError)
          throw scheduleError
        }
      }

      return task as HostelPmTask
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in completeTask', error)
      throw error
    }
  }

  // ── Get overdue tasks ───────────────────────────────────────────────
  static async getOverdueTasks(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient()
      const today = new Date().toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('hostel_pm_tasks')
        .select('*, hostel_pm_schedules(title), hostel_blocks(name, code)')
        .eq('institution_id', institutionId)
        .eq('status', 'open')
        .lt('due_date', today)
        .order('due_date', { ascending: true })

      if (error) {
        logger.error('campus-living/pm-schedule', 'Failed to fetch overdue tasks', error)
        throw error
      }
      return data as HostelPmTask[]
    } catch (error) {
      logger.error('campus-living/pm-schedule', 'Unexpected error in getOverdueTasks', error)
      throw error
    }
  }

  // ── Helper: calculate next due date by frequency ────────────────────
  private static calculateNextDueDate(currentDueDate: string, frequency: PmFrequency): string {
    const date = new Date(currentDueDate)

    switch (frequency) {
      case 'daily':
        date.setDate(date.getDate() + 1)
        break
      case 'weekly':
        date.setDate(date.getDate() + 7)
        break
      case 'biweekly':
        date.setDate(date.getDate() + 14)
        break
      case 'monthly':
        date.setMonth(date.getMonth() + 1)
        break
      case 'quarterly':
        date.setMonth(date.getMonth() + 3)
        break
      case 'half_yearly':
        date.setMonth(date.getMonth() + 6)
        break
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1)
        break
    }

    return date.toISOString().split('T')[0]
  }
}
