import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export class CampusLivingAnalytics {
  // ── Overall occupancy analytics ───────────────────────────────────
  static async getOccupancyAnalytics(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: blocks, error } = await supabase
        .from('hostel_blocks')
        .select('id, name, code, hostel_type, total_rooms, total_capacity, current_occupancy, status')
        .eq('institution_id', institutionId)
        .eq('status', 'active');

      if (error) {
        logger.error('campus-living/analytics', 'Failed to fetch occupancy analytics', error);
        throw error;
      }

      const blockData = blocks ?? [];
      const totalCapacity = blockData.reduce((s, b) => s + b.total_capacity, 0);
      const totalOccupancy = blockData.reduce((s, b) => s + b.current_occupancy, 0);

      // By hostel type
      const byType: Record<string, { capacity: number; occupancy: number; blocks: number }> = {};
      for (const b of blockData) {
        if (!byType[b.hostel_type]) byType[b.hostel_type] = { capacity: 0, occupancy: 0, blocks: 0 };
        byType[b.hostel_type].capacity += b.total_capacity;
        byType[b.hostel_type].occupancy += b.current_occupancy;
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
        by_block: blockData.map((b) => ({
          id: b.id,
          name: b.name,
          code: b.code,
          type: b.hostel_type,
          capacity: b.total_capacity,
          occupancy: b.current_occupancy,
          available: b.total_capacity - b.current_occupancy,
          percentage: b.total_capacity > 0 ? Math.round((b.current_occupancy / b.total_capacity) * 100) : 0,
        })),
      };
    } catch (error) {
      logger.error('campus-living/analytics', 'Unexpected error in getOccupancyAnalytics', error);
      throw error;
    }
  }

  // ── Attendance trend analytics ────────────────────────────────────
  static async getAttendanceTrend(
    institutionId: string,
    dateFrom: string,
    dateTo: string,
    blockId?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_attendance')
        .select('date, evening_status, is_curfew_violation')
        .eq('institution_id', institutionId)
        .gte('date', dateFrom)
        .lte('date', dateTo);

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
  static async getMaintenanceAnalytics(institutionId: string, dateFrom?: string, dateTo?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_maintenance_requests')
        .select('category, priority, status, sla_status, created_at, resolved_at')
        .eq('institution_id', institutionId);

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
  static async getIncidentAnalytics(institutionId: string, dateFrom?: string, dateTo?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_incidents')
        .select('incident_type, severity, status, incident_date, block_id')
        .eq('institution_id', institutionId);

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
  static async getMessAnalytics(institutionId: string, dateFrom: string, dateTo: string) {
    try {
      const supabase = createClientSupabaseClient();

      // Meal consumption
      const { data: meals, error: mealError } = await supabase
        .from('mess_meal_records')
        .select('meal_type, consumed, is_guest_meal, date')
        .eq('institution_id', institutionId)
        .gte('date', dateFrom)
        .lte('date', dateTo);

      if (mealError) throw mealError;

      // Feedback
      const { data: feedback, error: fbError } = await supabase
        .from('mess_feedback')
        .select('overall_rating, is_complaint')
        .eq('institution_id', institutionId)
        .gte('date', dateFrom)
        .lte('date', dateTo);

      if (fbError) throw fbError;

      // Waste
      const { data: waste, error: wasteError } = await supabase
        .from('mess_waste_log')
        .select('waste_quantity_kg, cost_of_waste')
        .eq('institution_id', institutionId)
        .gte('date', dateFrom)
        .lte('date', dateTo);

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

  // ── Risk alert generation ─────────────────────────────────────────
  static async generateRiskAlerts(institutionId: string) {
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
      const { data: attendance } = await supabase
        .from('hostel_attendance')
        .select('block_id, evening_status')
        .eq('institution_id', institutionId)
        .eq('date', today);

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
      const { data: breached } = await supabase
        .from('hostel_maintenance_requests')
        .select('id', { count: 'exact', head: true })
        .eq('institution_id', institutionId)
        .eq('sla_status', 'breached')
        .in('status', ['open', 'assigned', 'in_progress']);

      if (breached !== null) {
        // count returned in header
      }

      // 3. Overdue gate passes
      const now = new Date().toISOString();
      const { data: overdue } = await supabase
        .from('hostel_gate_passes')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .lt('expected_return', now);

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
