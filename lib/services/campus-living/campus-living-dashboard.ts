import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export class CampusLivingDashboard {
  // ── Main dashboard aggregation ────────────────────────────────────
  static async getDashboardData(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();

      // hostel-rooms-v2 PR 2: hostel_blocks.institution_id dropped — narrow
      // via hostel_block_institutions junction when institutionId is provided.
      let blockIdFilter: string[] | null = null;
      if (institutionId) {
        const { data: blockIds } = await supabase
          .from('hostel_block_institutions')
          .select('block_id')
          .eq('institution_id', institutionId);
        blockIdFilter = (blockIds ?? []).map((r) => r.block_id);
      }

      let blocksQ = supabase
        .from('hostel_blocks')
        .select('id, name, code, hostel_type, total_capacity, current_occupancy, status')
        .eq('status', 'active');
      if (blockIdFilter !== null) {
        if (blockIdFilter.length === 0) {
          // Caller's institution has no blocks — short-circuit.
          blocksQ = blocksQ.in('id', ['00000000-0000-0000-0000-000000000000']);
        } else {
          blocksQ = blocksQ.in('id', blockIdFilter);
        }
      }

      let todayAttQ = supabase
        .from('hostel_attendance')
        .select('evening_status, is_curfew_violation')
        .eq('date', today);
      if (institutionId) todayAttQ = todayAttQ.eq('institution_id', institutionId);

      let pendMaintQ = supabase
        .from('hostel_maintenance_requests')
        .select('id, priority, sla_status, status')
        .in('status', ['open', 'assigned', 'in_progress']);
      if (institutionId) pendMaintQ = pendMaintQ.eq('institution_id', institutionId);

      let activeIncQ = supabase
        .from('hostel_incidents')
        .select('id, severity, status')
        .in('status', ['reported', 'under_investigation']);
      if (institutionId) activeIncQ = activeIncQ.eq('institution_id', institutionId);

      let pendLeavesQ = supabase
        .from('hostel_leave_requests')
        .select('id, status')
        .in('status', ['pending_parent', 'pending_warden', 'pending_chief']);
      if (institutionId) pendLeavesQ = pendLeavesQ.eq('institution_id', institutionId);

      let overdueQ = supabase
        .from('hostel_gate_passes')
        .select('id')
        .eq('status', 'active')
        .lt('expected_return', now);
      if (institutionId) overdueQ = overdueQ.eq('institution_id', institutionId);

      let curVisQ = supabase
        .from('hostel_visitors')
        .select('id')
        .eq('status', 'checked_in');
      if (institutionId) curVisQ = curVisQ.eq('institution_id', institutionId);

      let alertsQ = supabase
        .from('hostel_risk_alerts')
        .select('id, severity, alert_type')
        .eq('status', 'active');
      if (institutionId) alertsQ = alertsQ.eq('institution_id', institutionId);

      const [
        blocksResult,
        todayAttendanceResult,
        pendingMaintenanceResult,
        activeIncidentsResult,
        pendingLeavesResult,
        overduePassesResult,
        currentVisitorsResult,
        alertsResult,
      ] = await Promise.all([
        blocksQ,
        todayAttQ,
        pendMaintQ,
        activeIncQ,
        pendLeavesQ,
        overdueQ,
        curVisQ,
        alertsQ,
      ]);

      // Process blocks
      const blocks = blocksResult.data ?? [];
      const totalCapacity = blocks.reduce((s, b) => s + (b.total_capacity ?? 0), 0);
      const totalOccupancy = blocks.reduce((s, b) => s + (b.current_occupancy ?? 0), 0);

      // Process attendance
      const attendance = todayAttendanceResult.data ?? [];
      const attendancePresent = attendance.filter((a) => a.evening_status === 'present').length;
      const curfewViolations = attendance.filter((a) => a.is_curfew_violation).length;

      // Process maintenance
      const maintenance = pendingMaintenanceResult.data ?? [];
      const slaBreached = maintenance.filter((m) => m.sla_status === 'breached').length;

      // Process incidents
      const incidents = activeIncidentsResult.data ?? [];
      const criticalIncidents = incidents.filter((i) => i.severity === 'critical' || i.severity === 'major').length;

      // Process alerts
      const alerts = alertsResult.data ?? [];
      const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length;

      return {
        occupancy: {
          total_capacity: totalCapacity,
          total_occupancy: totalOccupancy,
          available: totalCapacity - totalOccupancy,
          percentage: totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0,
          blocks: blocks.map((b) => {
            const cap = b.total_capacity ?? 0;
            const occ = b.current_occupancy ?? 0;
            return {
              id: b.id,
              name: b.name,
              code: b.code,
              type: b.hostel_type,
              capacity: cap,
              occupancy: occ,
              percentage: cap > 0 ? Math.round((occ / cap) * 100) : 0,
            };
          }),
        },
        attendance_today: {
          total: attendance.length,
          present: attendancePresent,
          absent: attendance.filter((a) => a.evening_status === 'absent').length,
          on_leave: attendance.filter((a) => a.evening_status === 'on_leave').length,
          percentage: attendance.length > 0 ? Math.round((attendancePresent / attendance.length) * 100) : 0,
          curfew_violations: curfewViolations,
        },
        maintenance: {
          pending: maintenance.length,
          sla_breached: slaBreached,
          critical: maintenance.filter((m) => m.priority === 'critical').length,
          high: maintenance.filter((m) => m.priority === 'high').length,
        },
        incidents: {
          active: incidents.length,
          critical: criticalIncidents,
        },
        leaves: {
          pending_approval: pendingLeavesResult.data?.length ?? 0,
        },
        gate_passes: {
          overdue: overduePassesResult.data?.length ?? 0,
        },
        visitors: {
          current: currentVisitorsResult.data?.length ?? 0,
        },
        alerts: {
          total: alerts.length,
          critical: criticalAlerts,
          warning: alerts.filter((a) => a.severity === 'warning').length,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getDashboardData', error);
      throw error;
    }
  }

  // ── Block-specific dashboard ──────────────────────────────────────
  static async getBlockDashboard(blockId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();

      const [
        blockResult,
        roomsResult,
        attendanceResult,
        maintenanceResult,
        visitorsResult,
        incidentsResult,
      ] = await Promise.all([
        supabase
          .from('hostel_blocks')
          .select('*')
          .eq('id', blockId)
          .maybeSingle(),

        // hostel-rooms-v2 PR 2: status + current_occupancy dropped; query
        // v_hostel_room_occupancy for the derived versions.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('v_hostel_room_occupancy')
          .select('room_id, capacity, active_residents, derived_status')
          .eq('block_id', blockId),

        supabase
          .from('hostel_attendance')
          .select('evening_status, is_curfew_violation')
          .eq('block_id', blockId)
          .eq('date', today),

        supabase
          .from('hostel_maintenance_requests')
          .select('id, priority, status')
          .eq('block_id', blockId)
          .in('status', ['open', 'assigned', 'in_progress']),

        supabase
          .from('hostel_visitors')
          .select('id')
          .eq('block_id', blockId)
          .eq('status', 'checked_in'),

        supabase
          .from('hostel_incidents')
          .select('id, severity')
          .eq('block_id', blockId)
          .in('status', ['reported', 'under_investigation']),
      ]);

      const block = blockResult.data;
      const rooms = roomsResult.data ?? [];
      const attendance = attendanceResult.data ?? [];

      return {
        block,
        rooms: {
          total: rooms.length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          available: rooms.filter((r: any) => r.derived_status === 'available').length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          partially_occupied: rooms.filter((r: any) => r.derived_status === 'partially_occupied').length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          full: rooms.filter((r: any) => r.derived_status === 'full').length,
          // No "maintenance" status post hostel-rooms-v2 PR 2 — kept key for
          // dashboard payload shape compatibility but always 0 until a
          // maintenance flag is reintroduced.
          maintenance: 0,
        },
        attendance_today: {
          total: attendance.length,
          present: attendance.filter((a) => a.evening_status === 'present').length,
          absent: attendance.filter((a) => a.evening_status === 'absent').length,
          on_leave: attendance.filter((a) => a.evening_status === 'on_leave').length,
          curfew_violations: attendance.filter((a) => a.is_curfew_violation).length,
        },
        maintenance_pending: maintenanceResult.data?.length ?? 0,
        visitors_current: visitorsResult.data?.length ?? 0,
        incidents_active: incidentsResult.data?.length ?? 0,
      };
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getBlockDashboard', error);
      throw error;
    }
  }

  // ── Quick stats (lightweight, for sidebar/header) ─────────────────
  static async getQuickStats(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();

      let residentsQ = supabase
        .from('hostel_allocations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      if (institutionId) residentsQ = residentsQ.eq('institution_id', institutionId);

      let pendLeavesQ = supabase
        .from('hostel_leave_requests')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending_parent', 'pending_warden', 'pending_chief']);
      if (institutionId) pendLeavesQ = pendLeavesQ.eq('institution_id', institutionId);

      let openMaintQ = supabase
        .from('hostel_maintenance_requests')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'assigned', 'in_progress']);
      if (institutionId) openMaintQ = openMaintQ.eq('institution_id', institutionId);

      let activeAlertsQ = supabase
        .from('hostel_risk_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      if (institutionId) activeAlertsQ = activeAlertsQ.eq('institution_id', institutionId);

      const [
        { count: totalResidents },
        { count: pendingLeaves },
        { count: openMaintenance },
        { count: activeAlerts },
      ] = await Promise.all([
        residentsQ,
        pendLeavesQ,
        openMaintQ,
        activeAlertsQ,
      ]);

      return {
        total_residents: totalResidents ?? 0,
        pending_leaves: pendingLeaves ?? 0,
        open_maintenance: openMaintenance ?? 0,
        active_alerts: activeAlerts ?? 0,
      };
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getQuickStats', error);
      throw error;
    }
  }
}
