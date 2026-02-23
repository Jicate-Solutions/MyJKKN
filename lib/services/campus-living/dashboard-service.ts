import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type { ManagementSummaryKPIs } from '@/types/campus-living'

export class DashboardService {
  // ── Management Summary KPIs ─────────────────────────────────────────
  static async getManagementSummary(institutionId?: string): Promise<ManagementSummaryKPIs> {
    try {
      const supabase = createClientSupabaseClient()
      const today = new Date().toISOString().split('T')[0]
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      // Build all queries in parallel for performance
      const [
        totalBedsResult,
        occupiedBedsResult,
        todayAttendanceResult,
        activeAllocationsResult,
        openMaintenanceResult,
        totalNonOpenMaintenanceResult,
        nonBreachedMaintenanceResult,
        activeIncidentsResult,
        pendingLeaveResult,
        overduePmResult,
        wellnessResult,
        activeHealthResult,
        expiringContractsResult,
      ] = await Promise.all([
        // Total beds
        (() => {
          let q = (supabase as any).from('hostel_beds').select('id', { count: 'exact', head: true })
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Occupied beds
        (() => {
          let q = (supabase as any).from('hostel_beds').select('id', { count: 'exact', head: true }).eq('status', 'occupied')
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Today's attendance count
        (() => {
          let q = (supabase as any).from('hostel_attendance').select('id', { count: 'exact', head: true }).eq('date', today)
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Total residents (active allocations)
        (() => {
          let q = (supabase as any).from('hostel_allocations').select('id', { count: 'exact', head: true }).eq('status', 'active')
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Open maintenance requests
        (() => {
          let q = (supabase as any).from('hostel_maintenance_requests').select('id', { count: 'exact', head: true }).in('status', ['open', 'assigned', 'in_progress'])
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Total non-open maintenance (for SLA calc denominator)
        (() => {
          let q = (supabase as any).from('hostel_maintenance_requests').select('id', { count: 'exact', head: true }).not('status', 'eq', 'open')
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Non-breached maintenance (for SLA calc numerator)
        (() => {
          let q = (supabase as any).from('hostel_maintenance_requests').select('id', { count: 'exact', head: true }).not('status', 'eq', 'open').neq('sla_status', 'breached')
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Active incidents
        (() => {
          let q = (supabase as any).from('hostel_incidents').select('id', { count: 'exact', head: true }).not('status', 'in', '("closed","resolved")')
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Pending leave requests
        (() => {
          let q = (supabase as any).from('hostel_leave_requests').select('id', { count: 'exact', head: true }).like('status', 'pending%')
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Overdue PM tasks
        (() => {
          let q = (supabase as any).from('hostel_pm_tasks').select('id', { count: 'exact', head: true }).lt('due_date', today).eq('status', 'open')
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Wellness score (avg overall_mood last 30 days)
        (() => {
          let q = (supabase as any).from('hostel_pulse_responses').select('overall_mood').gte('submitted_at', thirtyDaysAgo)
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Active health cases
        (() => {
          let q = (supabase as any).from('hostel_health_cases').select('id', { count: 'exact', head: true }).not('status', 'in', '("cleared","closed")')
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),

        // Expiring contracts (active, end_date within 30 days)
        (() => {
          const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          let q = (supabase as any).from('hostel_amc_contracts').select('id', { count: 'exact', head: true }).eq('status', 'active').lte('end_date', thirtyDaysFromNow)
          if (institutionId) q = q.eq('institution_id', institutionId)
          return q
        })(),
      ])

      // Extract counts with safe defaults
      const totalBeds = totalBedsResult.error ? 0 : (totalBedsResult.count ?? 0)
      const occupiedBeds = occupiedBedsResult.error ? 0 : (occupiedBedsResult.count ?? 0)
      const todayAttendance = todayAttendanceResult.error ? 0 : (todayAttendanceResult.count ?? 0)
      const totalResidents = activeAllocationsResult.error ? 0 : (activeAllocationsResult.count ?? 0)
      const openMaintenance = openMaintenanceResult.error ? 0 : (openMaintenanceResult.count ?? 0)
      const totalNonOpen = totalNonOpenMaintenanceResult.error ? 0 : (totalNonOpenMaintenanceResult.count ?? 0)
      const nonBreached = nonBreachedMaintenanceResult.error ? 0 : (nonBreachedMaintenanceResult.count ?? 0)
      const activeIncidents = activeIncidentsResult.error ? 0 : (activeIncidentsResult.count ?? 0)
      const pendingLeave = pendingLeaveResult.error ? 0 : (pendingLeaveResult.count ?? 0)
      const overduePmTasks = overduePmResult.error ? 0 : (overduePmResult.count ?? 0)
      const activeHealthCases = activeHealthResult.error ? 0 : (activeHealthResult.count ?? 0)
      const expiringContracts = expiringContractsResult.error ? 0 : (expiringContractsResult.count ?? 0)

      // Calculate occupancy rate
      const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100 * 10) / 10 : 0

      // Calculate SLA compliance
      const slaCompliance = totalNonOpen > 0 ? Math.round((nonBreached / totalNonOpen) * 100 * 10) / 10 : 100

      // Calculate wellness score (average of overall_mood)
      let wellnessScore: number | null = null
      if (!wellnessResult.error && wellnessResult.data && wellnessResult.data.length > 0) {
        const moods = wellnessResult.data
          .map((r: { overall_mood: number | null }) => r.overall_mood)
          .filter((m: number | null): m is number => m !== null)
        if (moods.length > 0) {
          wellnessScore = Math.round((moods.reduce((a: number, b: number) => a + b, 0) / moods.length) * 10) / 10
        }
      }

      // Log any sub-query errors for debugging
      const errors = [
        totalBedsResult.error && { query: 'totalBeds', error: totalBedsResult.error },
        occupiedBedsResult.error && { query: 'occupiedBeds', error: occupiedBedsResult.error },
        todayAttendanceResult.error && { query: 'todayAttendance', error: todayAttendanceResult.error },
        activeAllocationsResult.error && { query: 'activeAllocations', error: activeAllocationsResult.error },
        openMaintenanceResult.error && { query: 'openMaintenance', error: openMaintenanceResult.error },
        totalNonOpenMaintenanceResult.error && { query: 'totalNonOpenMaintenance', error: totalNonOpenMaintenanceResult.error },
        nonBreachedMaintenanceResult.error && { query: 'nonBreachedMaintenance', error: nonBreachedMaintenanceResult.error },
        activeIncidentsResult.error && { query: 'activeIncidents', error: activeIncidentsResult.error },
        pendingLeaveResult.error && { query: 'pendingLeave', error: pendingLeaveResult.error },
        overduePmResult.error && { query: 'overduePm', error: overduePmResult.error },
        wellnessResult.error && { query: 'wellness', error: wellnessResult.error },
        activeHealthResult.error && { query: 'activeHealth', error: activeHealthResult.error },
        expiringContractsResult.error && { query: 'expiringContracts', error: expiringContractsResult.error },
      ].filter(Boolean)

      if (errors.length > 0) {
        logger.error('campus-living/dashboard', 'Some KPI queries failed', errors)
      }

      return {
        occupancy_rate: occupancyRate,
        total_beds: totalBeds,
        occupied_beds: occupiedBeds,
        today_attendance: todayAttendance,
        total_residents: totalResidents,
        open_maintenance: openMaintenance,
        sla_compliance: slaCompliance,
        active_incidents: activeIncidents,
        pending_leave: pendingLeave,
        overdue_pm_tasks: overduePmTasks,
        wellness_score: wellnessScore,
        active_health_cases: activeHealthCases,
        expiring_contracts: expiringContracts,
      }
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getManagementSummary', error)
      throw error
    }
  }

  // ── Block-level Occupancy Breakdown ─────────────────────────────────
  static async getBlockOccupancy(institutionId?: string): Promise<
    { block_id: string; block_name: string; total_beds: number; occupied_beds: number; rate: number }[]
  > {
    try {
      const supabase = createClientSupabaseClient()

      // Fetch blocks
      let blocksQuery = (supabase as any).from('hostel_blocks').select('id, name').eq('status', 'active')
      if (institutionId) blocksQuery = blocksQuery.eq('institution_id', institutionId)
      const { data: blocks, error: blocksError } = await blocksQuery

      if (blocksError) {
        logger.error('campus-living/dashboard', 'Failed to fetch blocks for occupancy', blocksError)
        throw blocksError
      }
      if (!blocks || blocks.length === 0) return []

      // Fetch all beds (with block_id via room join or directly if bed has block info)
      // hostel_beds has room_id; we need to go beds → rooms → blocks
      // Simpler approach: get all beds with their room's block_id
      let bedsQuery = (supabase as any).from('hostel_beds').select('id, status, hostel_rooms!inner(block_id)')
      if (institutionId) bedsQuery = bedsQuery.eq('institution_id', institutionId)
      const { data: beds, error: bedsError } = await bedsQuery

      if (bedsError) {
        logger.error('campus-living/dashboard', 'Failed to fetch beds for occupancy', bedsError)
        throw bedsError
      }

      // Aggregate per block
      const blockMap = new Map<string, { total: number; occupied: number }>()
      for (const block of blocks) {
        blockMap.set(block.id, { total: 0, occupied: 0 })
      }

      for (const bed of (beds ?? [])) {
        const blockId = bed.hostel_rooms?.block_id
        if (!blockId) continue
        const entry = blockMap.get(blockId)
        if (!entry) continue
        entry.total += 1
        if (bed.status === 'occupied') entry.occupied += 1
      }

      return blocks.map((block: { id: string; name: string }) => {
        const entry = blockMap.get(block.id) ?? { total: 0, occupied: 0 }
        return {
          block_id: block.id,
          block_name: block.name,
          total_beds: entry.total,
          occupied_beds: entry.occupied,
          rate: entry.total > 0 ? Math.round((entry.occupied / entry.total) * 100 * 10) / 10 : 0,
        }
      })
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getBlockOccupancy', error)
      throw error
    }
  }

  // ── Attendance Trend (last N days) ──────────────────────────────────
  static async getAttendanceTrend(
    institutionId?: string,
    days: number = 7
  ): Promise<{ date: string; count: number }[]> {
    try {
      const supabase = createClientSupabaseClient()
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      let query = (supabase as any)
        .from('hostel_attendance')
        .select('date')
        .gte('date', startDate)
        .order('date', { ascending: true })
      if (institutionId) query = query.eq('institution_id', institutionId)

      const { data, error } = await query
      if (error) {
        logger.error('campus-living/dashboard', 'Failed to fetch attendance trend', error)
        throw error
      }

      // Group by date and count
      const dateCountMap = new Map<string, number>()
      for (const row of (data ?? [])) {
        const d = row.date as string
        dateCountMap.set(d, (dateCountMap.get(d) ?? 0) + 1)
      }

      return Array.from(dateCountMap.entries()).map(([date, count]) => ({ date, count }))
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getAttendanceTrend', error)
      throw error
    }
  }

  // ── Maintenance Requests by Category ────────────────────────────────
  static async getMaintenanceByCategory(
    institutionId?: string
  ): Promise<{ category: string; count: number }[]> {
    try {
      const supabase = createClientSupabaseClient()

      let query = (supabase as any)
        .from('hostel_maintenance_requests')
        .select('category')
        .in('status', ['open', 'assigned', 'in_progress'])
      if (institutionId) query = query.eq('institution_id', institutionId)

      const { data, error } = await query
      if (error) {
        logger.error('campus-living/dashboard', 'Failed to fetch maintenance by category', error)
        throw error
      }

      // Group by category and count
      const categoryMap = new Map<string, number>()
      for (const row of (data ?? [])) {
        const cat = row.category as string
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1)
      }

      return Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getMaintenanceByCategory', error)
      throw error
    }
  }
}
