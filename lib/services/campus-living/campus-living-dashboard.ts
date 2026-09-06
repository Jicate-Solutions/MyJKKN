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

      // Students who applied for a hostel bed but haven't been allocated one yet.
      // 'waiting' = in queue; 'offered' = bed offered but not yet confirmed/allocated.
      let waitlistQ = supabase
        .from('hostel_waitlist')
        .select('*', { count: 'exact', head: true })
        .in('status', ['waiting', 'offered']);
      if (institutionId) waitlistQ = waitlistQ.eq('institution_id', institutionId);

      // Total hostelites = ALL students registered in the hostel system (allocated
      // OR not). v_learner_hostelites LEFT JOINs hostel_allocations, so students
      // without a bed (current_allocation_id IS NULL) are still included here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let hostelitesCountQ = (supabase as any)
        .from('v_learner_hostelites')
        .select('*', { count: 'exact', head: true });
      if (institutionId) hostelitesCountQ = hostelitesCountQ.eq('institution_id', institutionId);

      const [
        blocksResult,
        todayAttendanceResult,
        pendingMaintenanceResult,
        activeIncidentsResult,
        pendingLeavesResult,
        overduePassesResult,
        currentVisitorsResult,
        alertsResult,
        waitlistResult,
        hostelitesCountResult,
      ] = await Promise.all([
        blocksQ,
        todayAttQ,
        pendMaintQ,
        activeIncQ,
        pendLeavesQ,
        overdueQ,
        curVisQ,
        alertsQ,
        waitlistQ,
        hostelitesCountQ,
      ]);

      // Process blocks. The stored hostel_blocks counters (total_capacity /
      // current_occupancy) drift — nothing maintains them — so derive
      // capacity/occupancy LIVE from hostel_rooms + v_hostel_room_occupancy.
      const blocks = blocksResult.data ?? [];
      const blockIds = blocks.map((b) => b.id);
      const capByBlock = new Map<string, number>();
      const occByBlock = new Map<string, number>();
      if (blockIds.length > 0) {
        const [roomsRes, occRes] = await Promise.all([
          supabase.from('hostel_rooms').select('block_id, capacity').in('block_id', blockIds),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from('v_hostel_room_occupancy').select('block_id, active_residents').in('block_id', blockIds),
        ]);
        for (const r of (roomsRes.data ?? []) as Array<{ block_id: string; capacity: number | null }>) {
          capByBlock.set(r.block_id, (capByBlock.get(r.block_id) ?? 0) + Number(r.capacity ?? 0));
        }
        for (const o of (occRes.data ?? []) as Array<{ block_id: string; active_residents: number | null }>) {
          occByBlock.set(o.block_id, (occByBlock.get(o.block_id) ?? 0) + Number(o.active_residents ?? 0));
        }
      }
      const totalCapacity = blockIds.reduce((s, id) => s + (capByBlock.get(id) ?? 0), 0);
      const totalOccupancy = blockIds.reduce((s, id) => s + (occByBlock.get(id) ?? 0), 0);

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
            const cap = capByBlock.get(b.id) ?? 0;
            const occ = occByBlock.get(b.id) ?? 0;
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
        waitlist: {
          pending: waitlistResult.count ?? 0,
        },
        // Exact allocation counts — three canonical numbers the dashboard reports.
        // total_hostelites: everyone registered in the hostel system (allocated OR not).
        // allocated: reuses totalOccupancy (sum of v_hostel_room_occupancy.active_residents,
        //   which counts check_out_date IS NULL per room) — the SAME source as the
        //   block-wise table so both sections always show identical "Residents" numbers.
        // not_allocated: in system but no current bed (may or may not be on waitlist).
        allocation_summary: {
          total_hostelites: hostelitesCountResult.count ?? 0,
          allocated: totalOccupancy,
          not_allocated: Math.max((hostelitesCountResult.count ?? 0) - totalOccupancy, 0),
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

  // ── Resident demographics & category mix (advanced analytics) ─────
  // Aggregates the active hostelite population (v_learner_hostelites) by
  // gender / year of study / room category / mess category for the dashboard
  // distribution charts. One scoped query, aggregated in JS.
  static async getResidentDemographics(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('v_learner_hostelites')
        .select('id, gender, year_of_study, hostel_category_name, mess_category_name');
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;
      if (error) {
        logger.error('campus-living/dashboard', 'Failed to fetch resident demographics', error);
        throw error;
      }
      const rows = (data ?? []) as Array<{
        gender: string | null;
        year_of_study: number | null;
        hostel_category_name: string | null;
        mess_category_name: string | null;
      }>;

      const tally = (vals: (string | null)[]) => {
        const m = new Map<string, number>();
        for (const v of vals) {
          const key = v && v.trim() ? v.trim() : 'Unspecified';
          m.set(key, (m.get(key) ?? 0) + 1);
        }
        return Array.from(m.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);
      };

      const normGender = (g: string | null) => {
        const v = (g ?? '').trim().toLowerCase();
        if (v === 'male' || v === 'm') return 'Male';
        if (v === 'female' || v === 'f') return 'Female';
        return v ? g!.trim() : 'Unspecified';
      };

      return {
        total: rows.length,
        byGender: tally(rows.map((r) => normGender(r.gender))),
        byYear: tally(
          rows.map((r) => (r.year_of_study != null ? `Year ${r.year_of_study}` : 'Unknown'))
        ),
        byRoomCategory: tally(rows.map((r) => r.hostel_category_name)),
        byMessCategory: tally(rows.map((r) => r.mess_category_name)),
      };
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getResidentDemographics', error);
      throw error;
    }
  }

  // ── Block × category occupancy ────────────────────────────────────
  // Counts real hostel_beds rows, NOT hostel_rooms.capacity. Capacity is intent; beds are
  // inventory, and the allocator can only place a learner on inventory. room_capacity comes
  // back alongside so the UI can flag blocks where the two disagree rather than silently
  // reporting a bed that cannot be allocated.
  static async getBlockCategoryOccupancy(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();

      // hostel_blocks has no institution_id — narrow via the junction, same as
      // getDashboardData does.
      let blockIdFilter: string[] | null = null;
      if (institutionId) {
        const { data: blockIds } = await supabase
          .from('hostel_block_institutions')
          .select('block_id')
          .eq('institution_id', institutionId);
        blockIdFilter = (blockIds ?? []).map((r) => r.block_id);
        if (blockIdFilter.length === 0) return [];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('v_hostel_block_category_occupancy')
        .select('*');
      if (blockIdFilter !== null) q = q.in('block_id', blockIdFilter);

      const { data, error } = await q;
      if (error) {
        logger.error('campus-living/dashboard', 'Failed to fetch block category occupancy', error);
        throw error;
      }

      return (data ?? []) as Array<{
        block_id: string;
        block_name: string;
        block_code: string | null;
        hostel_type: string;
        category_id: string | null;
        category_name: string;
        sort_order: number;
        rooms: number;
        beds: number;
        filled: number;
        vacant: number;
        room_capacity: number;
      }>;
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getBlockCategoryOccupancy', error);
      throw error;
    }
  }

  // ── Institution-wise residents ────────────────────────────────────
  // Residents holding a bed right now, split by hostel gender. Uses the same
  // check_out_date IS NULL test as the block table, so the two always reconcile.
  static async getInstitutionResidents(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('v_hostel_institution_residents')
        .select('*');
      if (institutionId) q = q.eq('institution_id', institutionId);

      const { data, error } = await q;
      if (error) {
        logger.error('campus-living/dashboard', 'Failed to fetch institution residents', error);
        throw error;
      }

      return ((data ?? []) as Array<{
        institution_id: string;
        institution_name: string;
        boys: number;
        girls: number;
        total: number;
      }>).sort((a, b) => b.total - a.total);
    } catch (error) {
      logger.error('campus-living/dashboard', 'Unexpected error in getInstitutionResidents', error);
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
