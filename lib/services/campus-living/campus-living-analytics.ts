import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export class CampusLivingAnalytics {
  // ── Overall occupancy analytics ───────────────────────────────────
  static async getOccupancyAnalytics(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();

      // hostel-rooms-v2 PR 2: hostel_blocks.institution_id dropped — narrow
      // via the hostel_block_institutions junction when institutionId given.
      let blockIdFilter: string[] | null = null;
      if (institutionId) {
        const { data: blockIds } = await supabase
          .from('hostel_block_institutions')
          .select('block_id')
          .eq('institution_id', institutionId);
        blockIdFilter = (blockIds ?? []).map((r) => r.block_id);
      }

      let blockQuery = supabase
        .from('hostel_blocks')
        .select('id, name, code, hostel_type, total_rooms, status')
        .eq('status', 'active');
      if (blockIdFilter !== null) {
        if (blockIdFilter.length === 0) {
          blockQuery = blockQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
        } else {
          blockQuery = blockQuery.in('id', blockIdFilter);
        }
      }
      const { data: blocks, error } = await blockQuery;

      if (error) {
        logger.error('campus-living/analytics', 'Failed to fetch occupancy analytics', error);
        throw error;
      }

      const blockData = blocks ?? [];

      // The stored hostel_blocks counters (total_capacity / current_occupancy)
      // drift — nothing maintains them — so derive capacity/occupancy LIVE
      // from hostel_rooms + v_hostel_room_occupancy, same as the Blocks page
      // and the dashboard overview.
      const blockIds = blockData.map((b) => b.id);
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

      // By hostel type
      const byType: Record<string, { capacity: number; occupancy: number; blocks: number }> = {};
      for (const b of blockData) {
        if (!byType[b.hostel_type]) byType[b.hostel_type] = { capacity: 0, occupancy: 0, blocks: 0 };
        byType[b.hostel_type].capacity += (capByBlock.get(b.id) ?? 0);
        byType[b.hostel_type].occupancy += (occByBlock.get(b.id) ?? 0);
        byType[b.hostel_type].blocks++;
      }

      return {
        total_blocks: blockData.length,
        total_capacity: totalCapacity,
        total_occupancy: totalOccupancy,
        available: totalCapacity - totalOccupancy,
        occupancy_percentage: totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0,
        by_type: Object.entries(byType).map(([type, data]) => ({
          type,
          ...data,
          percentage: data.capacity > 0 ? Math.round((data.occupancy / data.capacity) * 100) : 0,
        })),
        by_block: blockData.map((b) => {
          const cap = capByBlock.get(b.id) ?? 0;
          const occ = occByBlock.get(b.id) ?? 0;
          return {
            id: b.id,
            name: b.name,
            code: b.code,
            type: b.hostel_type,
            capacity: cap,
            occupancy: occ,
            available: cap - occ,
            percentage: cap > 0 ? Math.round((occ / cap) * 100) : 0,
          };
        }),
      };
    } catch (error) {
      logger.error('campus-living/analytics', 'Unexpected error in getOccupancyAnalytics', error);
      throw error;
    }
  }

  // ── Attendance trend analytics ────────────────────────────────────
  static async getAttendanceTrend(
    institutionId: string | undefined,
    dateFrom: string,
    dateTo: string,
    blockId?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_attendance')
        .select('date, evening_status, is_curfew_violation')
        .gte('date', dateFrom)
        .lte('date', dateTo);

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (blockId) query = query.eq('block_id', blockId);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/analytics', 'Failed to fetch attendance trend', error);
        throw error;
      }

      const records = data ?? [];

      // Group by date
      const dailyData: Record<string, {
        total: number;
        present: number;
        absent: number;
        on_leave: number;
        curfew_violations: number;
      }> = {};

      for (const r of records) {
        if (!dailyData[r.date]) {
          dailyData[r.date] = { total: 0, present: 0, absent: 0, on_leave: 0, curfew_violations: 0 };
        }
        dailyData[r.date].total++;
        if (r.evening_status === 'present') dailyData[r.date].present++;
        else if (r.evening_status === 'absent') dailyData[r.date].absent++;
        else if (r.evening_status === 'on_leave') dailyData[r.date].on_leave++;
        if (r.is_curfew_violation) dailyData[r.date].curfew_violations++;
      }

      return Object.entries(dailyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({
          date,
          ...d,
          attendance_percentage: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0,
        }));
    } catch (error) {
      logger.error('campus-living/analytics', 'Unexpected error in getAttendanceTrend', error);
      throw error;
    }
  }

  // ── Maintenance analytics ─────────────────────────────────────────
  static async getMaintenanceAnalytics(institutionId: string | undefined, dateFrom?: string, dateTo?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_maintenance_requests')
        .select('category, priority, status, sla_status, created_at, resolved_at');

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/analytics', 'Failed to fetch maintenance analytics', error);
        throw error;
      }

      const requests = data ?? [];

      // By category
      const byCategory: Record<string, number> = {};
      for (const r of requests) {
        byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
      }

      // By status
      const byStatus: Record<string, number> = {};
      for (const r of requests) {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      }

      // SLA compliance
      const slaBreached = requests.filter((r) => r.sla_status === 'breached').length;
      const slaOnTrack = requests.filter((r) => r.sla_status === 'on_track').length;

      // Average resolution time (for resolved requests)
      const resolvedRequests = requests.filter((r) => r.resolved_at);
      let avgResolutionHours = 0;
      if (resolvedRequests.length > 0) {
        const totalHours = resolvedRequests.reduce((s, r) => {
          const created = new Date(r.created_at).getTime();
          const resolved = new Date(r.resolved_at!).getTime();
          return s + (resolved - created) / (1000 * 60 * 60);
        }, 0);
        avgResolutionHours = Math.round((totalHours / resolvedRequests.length) * 10) / 10;
      }

      return {
        total: requests.length,
        by_category: byCategory,
        by_status: byStatus,
        sla_compliance: {
          on_track: slaOnTrack,
          breached: slaBreached,
          at_risk: requests.filter((r) => r.sla_status === 'at_risk').length,
          compliance_percentage: requests.length > 0
            ? Math.round(((requests.length - slaBreached) / requests.length) * 100)
            : 100,
        },
        average_resolution_hours: avgResolutionHours,
        by_priority: {
          critical: requests.filter((r) => r.priority === 'critical').length,
          high: requests.filter((r) => r.priority === 'high').length,
          medium: requests.filter((r) => r.priority === 'medium').length,
          low: requests.filter((r) => r.priority === 'low').length,
        },
      };
    } catch (error) {
      logger.error('campus-living/analytics', 'Unexpected error in getMaintenanceAnalytics', error);
      throw error;
    }
  }

  // ── Safety/Incident analytics ─────────────────────────────────────
  static async getIncidentAnalytics(institutionId: string | undefined, dateFrom?: string, dateTo?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_incidents')
        .select('incident_type, severity, status, incident_date, block_id');

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (dateFrom) query = query.gte('incident_date', dateFrom);
      if (dateTo) query = query.lte('incident_date', dateTo);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/analytics', 'Failed to fetch incident analytics', error);
        throw error;
      }

      const incidents = data ?? [];

      return {
        total: incidents.length,
        by_type: incidents.reduce((acc, i) => {
          acc[i.incident_type] = (acc[i.incident_type] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        by_severity: {
          minor: incidents.filter((i) => i.severity === 'minor').length,
          moderate: incidents.filter((i) => i.severity === 'moderate').length,
          major: incidents.filter((i) => i.severity === 'major').length,
          critical: incidents.filter((i) => i.severity === 'critical').length,
        },
        by_status: incidents.reduce((acc, i) => {
          acc[i.status] = (acc[i.status] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        open_incidents: incidents.filter((i) => i.status !== 'closed').length,
      };
    } catch (error) {
      logger.error('campus-living/analytics', 'Unexpected error in getIncidentAnalytics', error);
      throw error;
    }
  }

  // ── Mess analytics ────────────────────────────────────────────────
  static async getMessAnalytics(institutionId: string | undefined, dateFrom: string, dateTo: string) {
    try {
      const supabase = createClientSupabaseClient();

      // Meal consumption
      let mealQ = supabase
        .from('mess_meal_records')
        .select('meal_type, consumed, is_guest_meal, date')
        .gte('date', dateFrom)
        .lte('date', dateTo);
      if (institutionId) mealQ = mealQ.eq('institution_id', institutionId);
      const { data: meals, error: mealError } = await mealQ;

      if (mealError) throw mealError;

      // Feedback
      let fbQ = supabase
        .from('mess_feedback')
        .select('overall_rating, is_complaint')
        .gte('date', dateFrom)
        .lte('date', dateTo);
      if (institutionId) fbQ = fbQ.eq('institution_id', institutionId);
      const { data: feedback, error: fbError } = await fbQ;

      if (fbError) throw fbError;

      // Waste
      let wasteQ = supabase
        .from('mess_waste_log')
        .select('waste_quantity_kg, cost_of_waste')
        .gte('date', dateFrom)
        .lte('date', dateTo);
      if (institutionId) wasteQ = wasteQ.eq('institution_id', institutionId);
      const { data: waste, error: wasteError } = await wasteQ;

      if (wasteError) throw wasteError;

      const mealRecords = meals ?? [];
      const feedbacks = feedback ?? [];
      const wasteLogs = waste ?? [];

      // By meal type
      const byMealType: Record<string, number> = {};
      for (const m of mealRecords) {
        if (m.consumed) {
          byMealType[m.meal_type] = (byMealType[m.meal_type] ?? 0) + 1;
        }
      }

      return {
        total_meals_served: mealRecords.filter((m) => m.consumed).length,
        guest_meals: mealRecords.filter((m) => m.is_guest_meal).length,
        by_meal_type: byMealType,
        feedback: {
          total: feedbacks.length,
          average_rating: feedbacks.length > 0
            ? Math.round((feedbacks.reduce((s, f) => s + f.overall_rating, 0) / feedbacks.length) * 10) / 10
            : 0,
          complaints: feedbacks.filter((f) => f.is_complaint).length,
        },
        waste: {
          total_kg: Math.round(wasteLogs.reduce((s, w) => s + w.waste_quantity_kg, 0) * 10) / 10,
          total_cost: Math.round(wasteLogs.reduce((s, w) => s + (w.cost_of_waste ?? 0), 0) * 100) / 100,
          records: wasteLogs.length,
        },
      };
    } catch (error) {
      logger.error('campus-living/analytics', 'Unexpected error in getMessAnalytics', error);
      throw error;
    }
  }

  // ── Cross-domain correlation summary ──────────────────────────────
  // Derives a small set of cross-domain signals (attendance × maintenance
  // × incidents × fees) using the same source tables as the other
  // analytics methods. Heuristic — not a statistical model.
  static async getCrossDomainCorrelations(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      // Reuse last-30-days window for all signals
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - 30);
      const fromIso = from.toISOString();
      const fromDate = from.toISOString().slice(0, 10);

      // Attendance — daily presence ratio
      let attQ = supabase
        .from('hostel_attendance')
        .select('evening_status, is_curfew_violation, block_id')
        .gte('date', fromDate);
      if (institutionId) attQ = attQ.eq('institution_id', institutionId);
      const { data: attendance } = await attQ;

      const attRows = attendance ?? [];
      const totalAtt = attRows.length;
      const present = attRows.filter((r) => r.evening_status === 'present').length;
      const attendancePct = totalAtt > 0 ? Math.round((present / totalAtt) * 100) : 0;
      const curfewViolations = attRows.filter((r) => r.is_curfew_violation).length;

      // Maintenance — SLA + open count
      let mQ = supabase
        .from('hostel_maintenance_requests')
        .select('status, sla_status, priority')
        .gte('created_at', fromIso);
      if (institutionId) mQ = mQ.eq('institution_id', institutionId);
      const { data: maintenance } = await mQ;

      const mRows = maintenance ?? [];
      const slaBreached = mRows.filter((r) => r.sla_status === 'breached').length;
      const openHighPri = mRows.filter(
        (r) => r.status !== 'resolved' && r.status !== 'closed' && (r.priority === 'critical' || r.priority === 'high'),
      ).length;

      // Incidents — open + severity
      let iQ = supabase
        .from('hostel_incidents')
        .select('status, severity')
        .gte('incident_date', fromDate);
      if (institutionId) iQ = iQ.eq('institution_id', institutionId);
      const { data: incidents } = await iQ;

      const iRows = incidents ?? [];
      const openIncidents = iRows.filter((r) => r.status !== 'closed').length;
      const seriousIncidents = iRows.filter((r) => r.severity === 'critical' || r.severity === 'major').length;

      // Fees — defaulters via allocations
      let aQ = supabase
        .from('hostel_allocations')
        .select('fee_status')
        .eq('status', 'active');
      if (institutionId) aQ = aQ.eq('institution_id', institutionId);
      const { data: allocations } = await aQ;
      const aRows = allocations ?? [];
      const totalAlloc = aRows.length;
      const defaulters = aRows.filter((a) => a.fee_status === 'pending' || a.fee_status === 'partial').length;
      const defaulterPct = totalAlloc > 0 ? Math.round((defaulters / totalAlloc) * 100) : 0;

      // Mess feedback complaints
      let fbQ = supabase
        .from('mess_feedback')
        .select('overall_rating, is_complaint')
        .gte('date', fromDate);
      if (institutionId) fbQ = fbQ.eq('institution_id', institutionId);
      const { data: feedback } = await fbQ;
      const fbRows = feedback ?? [];
      const complaints = fbRows.filter((f) => f.is_complaint).length;
      const avgRating =
        fbRows.length > 0
          ? Math.round((fbRows.reduce((s, f) => s + f.overall_rating, 0) / fbRows.length) * 10) / 10
          : 0;

      // Build correlation signals — heuristic-only
      const correlations: {
        title: string;
        risk: 'low' | 'medium' | 'high';
        description: string;
        action: string;
      }[] = [];

      if (attendancePct < 80 && curfewViolations > 0) {
        correlations.push({
          title: 'Low attendance + curfew violations',
          risk: curfewViolations > 5 ? 'high' : 'medium',
          description: `Attendance is at ${attendancePct}% with ${curfewViolations} curfew violation(s) in the last 30 days. May indicate after-hours absenteeism.`,
          action: 'Review block-level evening rounds and curfew enforcement',
        });
      }

      if (slaBreached > 0 && complaints > 0) {
        correlations.push({
          title: 'Maintenance SLA breaches × mess complaints',
          risk: slaBreached + complaints > 10 ? 'high' : 'medium',
          description: `${slaBreached} SLA-breached maintenance request(s) and ${complaints} mess complaint(s) in the last 30 days. Service-quality pressure on multiple fronts.`,
          action: 'Daily check-in with maintenance + mess supervisors',
        });
      }

      if (openHighPri > 0 && seriousIncidents > 0) {
        correlations.push({
          title: 'Open high-priority maintenance × serious incidents',
          risk: 'high',
          description: `${openHighPri} high-priority maintenance request(s) open while ${seriousIncidents} major/critical incident(s) recorded. Safety risk elevated.`,
          action: 'Escalate high-priority requests to chief warden today',
        });
      }

      if (defaulterPct > 20) {
        correlations.push({
          title: 'High defaulter share',
          risk: defaulterPct > 40 ? 'high' : 'medium',
          description: `${defaulterPct}% of active allocations have unpaid or partial fees (${defaulters} / ${totalAlloc}).`,
          action: 'Run defaulter reminder cycle + finance review',
        });
      }

      if (avgRating > 0 && avgRating < 3) {
        correlations.push({
          title: 'Low mess satisfaction',
          risk: avgRating < 2.5 ? 'high' : 'medium',
          description: `Average mess rating is ${avgRating} / 5 over the last 30 days.`,
          action: 'Menu review with mess committee + sample tasting',
        });
      }

      if (correlations.length === 0) {
        correlations.push({
          title: 'No elevated cross-domain signals',
          risk: 'low',
          description: 'Attendance, maintenance, incidents, mess feedback, and fee status all within normal thresholds for the last 30 days.',
          action: 'No action needed — continue routine reviews',
        });
      }

      return {
        period: { from: fromDate, to: to.toISOString().slice(0, 10) },
        signals: {
          attendance_pct: attendancePct,
          curfew_violations: curfewViolations,
          maintenance_total: mRows.length,
          maintenance_sla_breached: slaBreached,
          maintenance_open_high_priority: openHighPri,
          incidents_total: iRows.length,
          incidents_open: openIncidents,
          incidents_serious: seriousIncidents,
          allocations_total: totalAlloc,
          fee_defaulters: defaulters,
          fee_defaulter_pct: defaulterPct,
          mess_complaints: complaints,
          mess_avg_rating: avgRating,
        },
        domain_scores: {
          attendance: attendancePct,
          maintenance:
            mRows.length === 0
              ? 100
              : Math.max(0, Math.round(((mRows.length - slaBreached) / mRows.length) * 100)),
          safety: Math.max(0, 100 - seriousIncidents * 10 - openIncidents * 2),
          fees: Math.max(0, 100 - defaulterPct),
          mess: avgRating > 0 ? Math.round(avgRating * 20) : 0,
        },
        correlations,
      };
    } catch (error) {
      logger.error('campus-living/analytics', 'Unexpected error in getCrossDomainCorrelations', error);
      throw error;
    }
  }

  // ── Risk alert generation ─────────────────────────────────────────
  static async generateRiskAlerts(institutionId: string | undefined) {
    try {
      const alerts: {
        type: string;
        severity: string;
        title: string;
        description: string;
        data: Record<string, unknown>;
      }[] = [];

      const supabase = createClientSupabaseClient();

      // 1. Low attendance blocks
      const today = new Date().toISOString().split('T')[0];
      let attQ = supabase
        .from('hostel_attendance')
        .select('block_id, evening_status')
        .eq('date', today);
      if (institutionId) attQ = attQ.eq('institution_id', institutionId);
      const { data: attendance } = await attQ;

      if (attendance && attendance.length > 0) {
        const blockAttendance: Record<string, { total: number; present: number }> = {};
        for (const a of attendance) {
          if (!blockAttendance[a.block_id]) blockAttendance[a.block_id] = { total: 0, present: 0 };
          blockAttendance[a.block_id].total++;
          if (a.evening_status === 'present') blockAttendance[a.block_id].present++;
        }
        for (const [blockId, stats] of Object.entries(blockAttendance)) {
          const pct = stats.total > 0 ? (stats.present / stats.total) * 100 : 100;
          if (pct < 70) {
            alerts.push({
              type: 'attendance_drop',
              severity: pct < 50 ? 'critical' : 'warning',
              title: 'Low attendance detected',
              description: `Block has ${Math.round(pct)}% attendance today`,
              data: { block_id: blockId, percentage: Math.round(pct) },
            });
          }
        }
      }

      // 2. SLA breaches
      let breachQ = supabase
        .from('hostel_maintenance_requests')
        .select('id', { count: 'exact', head: true })
        .eq('sla_status', 'breached')
        .in('status', ['open', 'assigned', 'in_progress']);
      if (institutionId) breachQ = breachQ.eq('institution_id', institutionId);
      const { data: breached } = await breachQ;

      if (breached !== null) {
        // count returned in header
      }

      // 3. Overdue gate passes
      const now = new Date().toISOString();
      let overdueQ = supabase
        .from('hostel_gate_passes')
        .select('id')
        .eq('status', 'active')
        .lt('expected_return', now);
      if (institutionId) overdueQ = overdueQ.eq('institution_id', institutionId);
      const { data: overdue } = await overdueQ;

      if (overdue && overdue.length > 0) {
        alerts.push({
          type: 'fee_default',
          severity: overdue.length > 5 ? 'critical' : 'warning',
          title: 'Overdue gate passes',
          description: `${overdue.length} students have not returned on time`,
          data: { count: overdue.length },
        });
      }

      return alerts;
    } catch (error) {
      logger.error('campus-living/analytics', 'Unexpected error in generateRiskAlerts', error);
      throw error;
    }
  }
}
