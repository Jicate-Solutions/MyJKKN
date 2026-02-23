import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type { ActivityItem, ActivityFilters, ActivityType } from '@/types/campus-living'

const ICON_COLORS: Record<ActivityType, string> = {
  maintenance: 'text-orange-500',
  leave: 'text-blue-500',
  incident: 'text-red-500',
  health: 'text-pink-500',
  pm_task: 'text-purple-500',
  cleaning: 'text-green-500',
  laundry: 'text-cyan-500',
  onboarding: 'text-indigo-500',
}

const PER_TABLE_LIMIT = 50

export class ActivityHubService {
  // ── Aggregate recent activity across all campus-living sub-modules ──
  static async getRecentActivity(
    institutionId: string | undefined,
    filters?: ActivityFilters
  ): Promise<ActivityItem[]> {
    const supabase = createClientSupabaseClient()
    const limit = filters?.limit ?? 100
    const offset = filters?.offset ?? 0

    // Default date range: last 14 days
    const dateFrom =
      filters?.date_from ??
      new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const dateTo = filters?.date_to ?? new Date().toISOString()

    // For columns that are PostgreSQL `date` type (not timestamptz), we must
    // compare with YYYY-MM-DD strings — otherwise PostgreSQL casts the date to
    // midnight UTC which silently excludes items on the boundary date.
    const dateFromDate = dateFrom.split('T')[0]
    const dateToDate = dateTo.split('T')[0]

    // Helper: scope query to institution if provided
    const scopeInstitution = (q: any) => {
      if (institutionId) return q.eq('institution_id', institutionId)
      return q
    }

    // Helper: scope query to block if filter provided
    const scopeBlock = (q: any, hasBlockCol = true) => {
      if (filters?.block_id && hasBlockCol) return q.eq('block_id', filters.block_id)
      return q
    }

    // Determine which tables to query
    const typeFilter = filters?.activity_type

    // ── 1. Maintenance Requests ───────────────────────────────────────
    const fetchMaintenance = async (): Promise<ActivityItem[]> => {
      if (typeFilter && typeFilter !== 'maintenance') return []
      try {
        let q = (supabase as any)
          .from('hostel_maintenance_requests')
          .select('id, title, status, created_at, block_id, hostel_blocks(name)')
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo)
          .order('created_at', { ascending: false })
          .limit(PER_TABLE_LIMIT)

        q = scopeInstitution(q)
        q = scopeBlock(q)

        const { data, error } = await q
        if (error) {
          logger.error('campus-living/activity-hub', 'Failed to fetch maintenance activity', error)
          return []
        }
        return (data ?? []).map((r: any) => ({
          id: r.id,
          type: 'maintenance' as ActivityType,
          title: r.title || 'Maintenance Request',
          description: `Status: ${r.status}`,
          timestamp: r.created_at,
          status: r.status,
          link: `/campus-living/maintenance/${r.id}`,
          block_name: r.hostel_blocks?.name ?? undefined,
          icon_color: ICON_COLORS.maintenance,
        }))
      } catch {
        return []
      }
    }

    // ── 2. Leave Requests ─────────────────────────────────────────────
    const fetchLeave = async (): Promise<ActivityItem[]> => {
      if (typeFilter && typeFilter !== 'leave') return []
      try {
        let q = (supabase as any)
          .from('hostel_leave_requests')
          .select('id, status, created_at, from_date, to_date, block_id, hostel_blocks(name)')
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo)
          .order('created_at', { ascending: false })
          .limit(PER_TABLE_LIMIT)

        q = scopeInstitution(q)
        q = scopeBlock(q)

        const { data, error } = await q
        if (error) {
          logger.error('campus-living/activity-hub', 'Failed to fetch leave activity', error)
          return []
        }
        return (data ?? []).map((r: any) => ({
          id: r.id,
          type: 'leave' as ActivityType,
          title: `Leave Request: ${r.status}`,
          description: `${r.from_date} to ${r.to_date}`,
          timestamp: r.created_at,
          status: r.status,
          link: `/campus-living/leave/${r.id}`,
          block_name: r.hostel_blocks?.name ?? undefined,
          icon_color: ICON_COLORS.leave,
        }))
      } catch {
        return []
      }
    }

    // ── 3. Incidents ──────────────────────────────────────────────────
    const fetchIncidents = async (): Promise<ActivityItem[]> => {
      if (typeFilter && typeFilter !== 'incident') return []
      try {
        let q = (supabase as any)
          .from('hostel_incidents')
          .select('id, title, status, severity, created_at, block_id, hostel_blocks(name)')
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo)
          .order('created_at', { ascending: false })
          .limit(PER_TABLE_LIMIT)

        q = scopeInstitution(q)
        q = scopeBlock(q)

        const { data, error } = await q
        if (error) {
          logger.error('campus-living/activity-hub', 'Failed to fetch incident activity', error)
          return []
        }
        return (data ?? []).map((r: any) => ({
          id: r.id,
          type: 'incident' as ActivityType,
          title: r.title || 'Incident Report',
          description: `Severity: ${r.severity} | Status: ${r.status}`,
          timestamp: r.created_at,
          status: r.status,
          link: `/campus-living/safety/incidents/${r.id}`,
          block_name: r.hostel_blocks?.name ?? undefined,
          icon_color: ICON_COLORS.incident,
        }))
      } catch {
        return []
      }
    }

    // ── 4. Health Cases ───────────────────────────────────────────────
    const fetchHealth = async (): Promise<ActivityItem[]> => {
      if (typeFilter && typeFilter !== 'health') return []
      try {
        let q = (supabase as any)
          .from('hostel_health_cases')
          .select('id, case_number, symptoms, status, severity, created_at, block_id, hostel_blocks(name)')
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo)
          .order('created_at', { ascending: false })
          .limit(PER_TABLE_LIMIT)

        q = scopeInstitution(q)
        q = scopeBlock(q)

        const { data, error } = await q
        if (error) {
          logger.error('campus-living/activity-hub', 'Failed to fetch health activity', error)
          return []
        }
        return (data ?? []).map((r: any) => ({
          id: r.id,
          type: 'health' as ActivityType,
          title: `Health: ${r.case_number || 'Case'}`,
          description: `Severity: ${r.severity} | ${r.symptoms || r.status}`,
          timestamp: r.created_at,
          status: r.status,
          link: `/campus-living/health/${r.id}`,
          block_name: r.hostel_blocks?.name ?? undefined,
          icon_color: ICON_COLORS.health,
        }))
      } catch {
        return []
      }
    }

    // ── 5. PM Tasks ───────────────────────────────────────────────────
    const fetchPmTasks = async (): Promise<ActivityItem[]> => {
      if (typeFilter && typeFilter !== 'pm_task') return []
      try {
        let q = (supabase as any)
          .from('hostel_pm_tasks')
          .select('id, title, status, due_date, block_id, hostel_blocks(name)')
          .gte('due_date', dateFromDate)
          .lte('due_date', dateToDate)
          .order('due_date', { ascending: false })
          .limit(PER_TABLE_LIMIT)

        q = scopeInstitution(q)
        q = scopeBlock(q)

        const { data, error } = await q
        if (error) {
          logger.error('campus-living/activity-hub', 'Failed to fetch PM task activity', error)
          return []
        }
        return (data ?? []).map((r: any) => ({
          id: r.id,
          type: 'pm_task' as ActivityType,
          title: r.title || 'PM Task',
          description: `Due: ${r.due_date} | Status: ${r.status}`,
          timestamp: r.due_date,
          status: r.status,
          link: '/campus-living/maintenance/preventive/tasks',
          block_name: r.hostel_blocks?.name ?? undefined,
          icon_color: ICON_COLORS.pm_task,
        }))
      } catch {
        return []
      }
    }

    // ── 6. Cleaning Tasks ─────────────────────────────────────────────
    const fetchCleaning = async (): Promise<ActivityItem[]> => {
      if (typeFilter && typeFilter !== 'cleaning') return []
      try {
        let q = (supabase as any)
          .from('hostel_cleaning_tasks')
          .select('id, cleaning_type, status, date, block_id, hostel_blocks(name)')
          .gte('date', dateFromDate)
          .lte('date', dateToDate)
          .order('date', { ascending: false })
          .limit(PER_TABLE_LIMIT)

        q = scopeInstitution(q)
        q = scopeBlock(q)

        const { data, error } = await q
        if (error) {
          logger.error('campus-living/activity-hub', 'Failed to fetch cleaning activity', error)
          return []
        }
        return (data ?? []).map((r: any) => ({
          id: r.id,
          type: 'cleaning' as ActivityType,
          title: `Cleaning: ${r.cleaning_type || 'Task'}`,
          description: `Date: ${r.date} | Status: ${r.status}`,
          timestamp: r.date,
          status: r.status,
          link: '/campus-living/housekeeping/tasks',
          block_name: r.hostel_blocks?.name ?? undefined,
          icon_color: ICON_COLORS.cleaning,
        }))
      } catch {
        return []
      }
    }

    // ── 7. Laundry Orders ─────────────────────────────────────────────
    const fetchLaundry = async (): Promise<ActivityItem[]> => {
      if (typeFilter && typeFilter !== 'laundry') return []
      try {
        let q = (supabase as any)
          .from('hostel_laundry_orders')
          .select('id, status, created_at, block_id, hostel_blocks(name)')
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo)
          .order('created_at', { ascending: false })
          .limit(PER_TABLE_LIMIT)

        q = scopeInstitution(q)
        q = scopeBlock(q)

        const { data, error } = await q
        if (error) {
          logger.error('campus-living/activity-hub', 'Failed to fetch laundry activity', error)
          return []
        }
        return (data ?? []).map((r: any) => ({
          id: r.id,
          type: 'laundry' as ActivityType,
          title: `Laundry Order: ${r.status}`,
          description: `Status: ${r.status}`,
          timestamp: r.created_at,
          status: r.status,
          link: '/campus-living/laundry',
          block_name: r.hostel_blocks?.name ?? undefined,
          icon_color: ICON_COLORS.laundry,
        }))
      } catch {
        return []
      }
    }

    // ── 8. Onboarding Checklists ──────────────────────────────────────
    const fetchOnboarding = async (): Promise<ActivityItem[]> => {
      if (typeFilter && typeFilter !== 'onboarding') return []
      try {
        let q = (supabase as any)
          .from('hostel_onboarding_checklists')
          .select('id, learner_id, status, created_at, profiles!hostel_onboarding_checklists_learner_id_fkey(full_name)')
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo)
          .order('created_at', { ascending: false })
          .limit(PER_TABLE_LIMIT)

        q = scopeInstitution(q)
        // onboarding_checklists has no block_id — no block scoping

        const { data, error } = await q
        if (error) {
          logger.error('campus-living/activity-hub', 'Failed to fetch onboarding activity', error)
          return []
        }
        return (data ?? []).map((r: any) => ({
          id: r.id,
          type: 'onboarding' as ActivityType,
          title: `Onboarding: ${r.status}`,
          description: `Learner: ${r.profiles?.full_name || 'Unknown'} | Status: ${r.status}`,
          timestamp: r.created_at,
          status: r.status,
          link: '/campus-living/allocations/onboarding',
          icon_color: ICON_COLORS.onboarding,
        }))
      } catch {
        return []
      }
    }

    // ── Execute all queries in parallel ───────────────────────────────
    const [
      maintenance,
      leave,
      incidents,
      health,
      pmTasks,
      cleaning,
      laundry,
      onboarding,
    ] = await Promise.all([
      fetchMaintenance(),
      fetchLeave(),
      fetchIncidents(),
      fetchHealth(),
      fetchPmTasks(),
      fetchCleaning(),
      fetchLaundry(),
      fetchOnboarding(),
    ])

    // Merge all results
    const merged = [
      ...maintenance,
      ...leave,
      ...incidents,
      ...health,
      ...pmTasks,
      ...cleaning,
      ...laundry,
      ...onboarding,
    ]

    // Sort by timestamp descending
    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Apply overall offset and limit
    return merged.slice(offset, offset + limit)
  }
}
