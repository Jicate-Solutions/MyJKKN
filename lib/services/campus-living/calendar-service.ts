import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarFilters,
} from '@/types/campus-living'

export class CalendarService {
  // ── Get all calendar events for a given month ───────────────────────
  static async getCalendarEvents(
    institutionId: string | undefined,
    filters: CalendarFilters
  ): Promise<CalendarEvent[]> {
    const { month, year, layers } = filters

    // Calculate first and last day of the month (YYYY-MM-DD)
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
    const daysInMonth = new Date(year, month, 0).getDate()
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    const supabase = createClientSupabaseClient()
    const queries: Promise<CalendarEvent[]>[] = []

    // ── 1. PM Tasks ────────────────────────────────────────────────
    if (!layers || layers.includes('pm_task')) {
      queries.push(
        (async () => {
          try {
            let q = (supabase as any)
              .from('hostel_pm_tasks')
              .select('id, title, due_date, status')
              .gte('due_date', firstDay)
              .lte('due_date', lastDay)

            if (institutionId) q = q.eq('institution_id', institutionId)

            const { data, error } = await q
            if (error) {
              logger.error('campus-living/calendar', 'Failed to fetch PM tasks', error)
              return []
            }

            return ((data ?? []) as Array<{ id: string; title: string; due_date: string; status: string }>).map(
              (row) => ({
                id: row.id,
                type: 'pm_task' as CalendarEventType,
                title: row.title,
                date: row.due_date,
                color: '#8b5cf6',
                link: '/campus-living/maintenance/preventive/tasks',
              })
            )
          } catch {
            return []
          }
        })()
      )
    }

    // ── 2. Cleaning Tasks ──────────────────────────────────────────
    if (!layers || layers.includes('cleaning')) {
      queries.push(
        (async () => {
          try {
            let q = (supabase as any)
              .from('hostel_cleaning_tasks')
              .select('id, cleaning_type, date, status')
              .gte('date', firstDay)
              .lte('date', lastDay)

            if (institutionId) q = q.eq('institution_id', institutionId)

            const { data, error } = await q
            if (error) {
              logger.error('campus-living/calendar', 'Failed to fetch cleaning tasks', error)
              return []
            }

            return ((data ?? []) as Array<{ id: string; cleaning_type: string; date: string; status: string }>).map(
              (row) => ({
                id: row.id,
                type: 'cleaning' as CalendarEventType,
                title: `Cleaning: ${row.cleaning_type}`,
                date: row.date,
                color: '#22c55e',
                link: '/campus-living/housekeeping/tasks',
              })
            )
          } catch {
            return []
          }
        })()
      )
    }

    // ── 3. Approved Leave Requests ─────────────────────────────────
    if (!layers || layers.includes('leave')) {
      queries.push(
        (async () => {
          try {
            let q = (supabase as any)
              .from('hostel_leave_requests')
              .select('id, from_date, to_date, status')
              .eq('status', 'approved')
              .lte('from_date', lastDay)
              .gte('to_date', firstDay)

            if (institutionId) q = q.eq('institution_id', institutionId)

            const { data, error } = await q
            if (error) {
              logger.error('campus-living/calendar', 'Failed to fetch leave requests', error)
              return []
            }

            return ((data ?? []) as Array<{ id: string; from_date: string; to_date: string; status: string }>).map(
              (row) => ({
                id: row.id,
                type: 'leave' as CalendarEventType,
                title: `Leave (${row.from_date} to ${row.to_date})`,
                date: row.from_date,
                end_date: row.to_date,
                color: '#3b82f6',
                link: `/campus-living/leave/${row.id}`,
              })
            )
          } catch {
            return []
          }
        })()
      )
    }

    // ── 4. Learners Council Events ─────────────────────────────────
    if (!layers || layers.includes('lc_event')) {
      queries.push(
        (async () => {
          try {
            let q = (supabase as any)
              .from('lc_events')
              .select('id, title, starts_at, ends_at, status')
              .eq('status', 'published')
              .lte('starts_at', `${lastDay}T23:59:59`)
              .gte('ends_at', `${firstDay}T00:00:00`)

            if (institutionId) q = q.eq('institution_id', institutionId)

            const { data, error } = await q
            if (error) {
              logger.error('campus-living/calendar', 'Failed to fetch LC events', error)
              return []
            }

            return ((data ?? []) as Array<{ id: string; title: string; starts_at: string; ends_at: string; status: string }>).map(
              (row) => ({
                id: row.id,
                type: 'lc_event' as CalendarEventType,
                title: row.title,
                date: row.starts_at.split('T')[0],
                end_date: row.ends_at.split('T')[0],
                color: '#f59e0b',
                link: `/learners-council/events/${row.id}`,
              })
            )
          } catch {
            return []
          }
        })()
      )
    }

    // ── Run all queries in parallel and merge ──────────────────────
    const results = await Promise.all(queries)
    const merged = results.flat()

    // Sort by date ascending
    merged.sort((a, b) => a.date.localeCompare(b.date))

    return merged
  }

  // ── Get events for a specific date ──────────────────────────────────
  static async getEventsByDate(
    institutionId: string | undefined,
    date: string,
    layers?: CalendarEventType[]
  ): Promise<CalendarEvent[]> {
    const supabase = createClientSupabaseClient()
    const queries: Promise<CalendarEvent[]>[] = []

    // ── 1. PM Tasks ────────────────────────────────────────────────
    if (!layers || layers.includes('pm_task')) {
      queries.push(
        (async () => {
          try {
            let q = (supabase as any)
              .from('hostel_pm_tasks')
              .select('id, title, due_date, status')
              .eq('due_date', date)

            if (institutionId) q = q.eq('institution_id', institutionId)

            const { data, error } = await q
            if (error) {
              logger.error('campus-living/calendar', 'Failed to fetch PM tasks by date', error)
              return []
            }

            return ((data ?? []) as Array<{ id: string; title: string; due_date: string; status: string }>).map(
              (row) => ({
                id: row.id,
                type: 'pm_task' as CalendarEventType,
                title: row.title,
                date: row.due_date,
                color: '#8b5cf6',
                link: '/campus-living/maintenance/preventive/tasks',
              })
            )
          } catch {
            return []
          }
        })()
      )
    }

    // ── 2. Cleaning Tasks ──────────────────────────────────────────
    if (!layers || layers.includes('cleaning')) {
      queries.push(
        (async () => {
          try {
            let q = (supabase as any)
              .from('hostel_cleaning_tasks')
              .select('id, cleaning_type, date, status')
              .eq('date', date)

            if (institutionId) q = q.eq('institution_id', institutionId)

            const { data, error } = await q
            if (error) {
              logger.error('campus-living/calendar', 'Failed to fetch cleaning tasks by date', error)
              return []
            }

            return ((data ?? []) as Array<{ id: string; cleaning_type: string; date: string; status: string }>).map(
              (row) => ({
                id: row.id,
                type: 'cleaning' as CalendarEventType,
                title: `Cleaning: ${row.cleaning_type}`,
                date: row.date,
                color: '#22c55e',
                link: '/campus-living/housekeeping/tasks',
              })
            )
          } catch {
            return []
          }
        })()
      )
    }

    // ── 3. Approved Leave Requests overlapping this date ───────────
    if (!layers || layers.includes('leave')) {
      queries.push(
        (async () => {
          try {
            let q = (supabase as any)
              .from('hostel_leave_requests')
              .select('id, from_date, to_date, status')
              .eq('status', 'approved')
              .lte('from_date', date)
              .gte('to_date', date)

            if (institutionId) q = q.eq('institution_id', institutionId)

            const { data, error } = await q
            if (error) {
              logger.error('campus-living/calendar', 'Failed to fetch leave requests by date', error)
              return []
            }

            return ((data ?? []) as Array<{ id: string; from_date: string; to_date: string; status: string }>).map(
              (row) => ({
                id: row.id,
                type: 'leave' as CalendarEventType,
                title: `Leave (${row.from_date} to ${row.to_date})`,
                date: row.from_date,
                end_date: row.to_date,
                color: '#3b82f6',
                link: `/campus-living/leave/${row.id}`,
              })
            )
          } catch {
            return []
          }
        })()
      )
    }

    // ── 4. Learners Council Events overlapping this date ───────────
    if (!layers || layers.includes('lc_event')) {
      queries.push(
        (async () => {
          try {
            let q = (supabase as any)
              .from('lc_events')
              .select('id, title, starts_at, ends_at, status')
              .eq('status', 'published')
              .lte('starts_at', `${date}T23:59:59`)
              .gte('ends_at', `${date}T00:00:00`)

            if (institutionId) q = q.eq('institution_id', institutionId)

            const { data, error } = await q
            if (error) {
              logger.error('campus-living/calendar', 'Failed to fetch LC events by date', error)
              return []
            }

            return ((data ?? []) as Array<{ id: string; title: string; starts_at: string; ends_at: string; status: string }>).map(
              (row) => ({
                id: row.id,
                type: 'lc_event' as CalendarEventType,
                title: row.title,
                date: row.starts_at.split('T')[0],
                end_date: row.ends_at.split('T')[0],
                color: '#f59e0b',
                link: `/learners-council/events/${row.id}`,
              })
            )
          } catch {
            return []
          }
        })()
      )
    }

    // ── Run all queries in parallel and merge ──────────────────────
    const results = await Promise.all(queries)
    const merged = results.flat()

    // Sort by date ascending
    merged.sort((a, b) => a.date.localeCompare(b.date))

    return merged
  }
}
