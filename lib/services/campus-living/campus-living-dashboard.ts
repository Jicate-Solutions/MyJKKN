import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export class CampusLivingDashboard {
  // ── Main dashboard aggregation ────────────────────────────────────
  static async getDashboardData(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();

      // Build queries with optional institution scope (super_admin: institutionId='' → no filter)
      let blocksQ = supabase
        .from('hostel_blocks')
        .select('id, name, code, hostel_type, total_capacity, current_occupancy, status')
        .eq('status', 'active');
      if (institutionId) blocksQ = blocksQ.eq('institution_id', institutionId);

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
      const totalCapacity = blocks.reduce((s, b) => s + b.total_capacity, 0);
      const totalOccupancy = blocks.reduce((s, b) => s + b.current_occupancy, 0);

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
          blocks: blocks.map((b) => ({
            id: b.id,
            name: b.name,
            code: b.code,
            type: b.hostel_type,
            capacity: b.total_capacity,
            occupancy: b.current_occupancy,
            percentage: b.total_capacity > 0 ? Math.round((b.current_occupancy / b.total_capacity) * 100) : 0,
          })),
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
          .single(),

        supabase
          .from('hostel_rooms')
          .select('id, status, capacity, current_occupancy')
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
          available: rooms.filter((r) => r.status === 'available').length,
          partially_occupied: rooms.filter((r) => r.status === 'partially_occupied').length,
          full: rooms.filter((r) => r.status === 'full').length,
          maintenance: rooms.filter((r) => r.status === 'maintenance').length,
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
