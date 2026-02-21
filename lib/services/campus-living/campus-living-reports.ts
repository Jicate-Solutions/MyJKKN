import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export class CampusLivingReports {
  // ── Occupancy Report ──────────────────────────────────────────────
  static async generateOccupancyReport(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();

      const { data: blocks, error: blockError } = await supabase
        .from('hostel_blocks')
        .select('id, name, code, hostel_type, total_rooms, total_capacity, current_occupancy, status')
        .eq('institution_id', institutionId)
        .order('name');

      if (blockError) throw blockError;

      const { data: rooms, error: roomError } = await supabase
        .from('hostel_rooms')
        .select('id, block_id, room_number, floor, room_type, ac_status, capacity, current_occupancy, status')
        .eq('institution_id', institutionId)
        .order('block_id')
        .order('room_number');

      if (roomError) throw roomError;

      const blockData = blocks ?? [];
      const roomData = rooms ?? [];

      // Summary
      const totalCapacity = blockData.reduce((s, b) => s + b.total_capacity, 0);
      const totalOccupancy = blockData.reduce((s, b) => s + b.current_occupancy, 0);

      // Room breakdown by type
      const roomsByType: Record<string, { total: number; occupied: number; available: number }> = {};
      for (const room of roomData) {
        if (!roomsByType[room.room_type]) roomsByType[room.room_type] = { total: 0, occupied: 0, available: 0 };
        roomsByType[room.room_type].total++;
        if (room.status === 'full') roomsByType[room.room_type].occupied++;
        else if (room.status === 'available') roomsByType[room.room_type].available++;
      }

      return {
        report_type: 'occupancy',
        generated_at: new Date().toISOString(),
        summary: {
          total_blocks: blockData.length,
          total_rooms: roomData.length,
          total_capacity: totalCapacity,
          total_occupancy: totalOccupancy,
          overall_percentage: totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0,
        },
        blocks: blockData.map((b) => ({
          ...b,
          occupancy_percentage: b.total_capacity > 0 ? Math.round((b.current_occupancy / b.total_capacity) * 100) : 0,
          rooms: roomData.filter((r) => r.block_id === b.id),
        })),
        rooms_by_type: roomsByType,
      };
    } catch (error) {
      logger.error('campus-living/reports', 'Unexpected error in generateOccupancyReport', error);
      throw error;
    }
  }

  // ── Attendance Register Report ────────────────────────────────────
  static async generateAttendanceRegister(
    institutionId: string,
    dateFrom: string,
    dateTo: string,
    blockId?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_attendance')
        .select('*')
        .eq('institution_id', institutionId)
        .gte('date', dateFrom)
        .lte('date', dateTo);

      if (blockId) query = query.eq('block_id', blockId);
      query = query.order('date').order('learner_id');

      const { data, error } = await query;
      if (error) throw error;

      const records = data ?? [];

      // Group by learner
      const byLearner: Record<string, {
        learner_id: string;
        total_days: number;
        present: number;
        absent: number;
        on_leave: number;
        late_entry: number;
        curfew_violations: number;
        records: typeof records;
      }> = {};

      for (const r of records) {
        if (!byLearner[r.learner_id]) {
          byLearner[r.learner_id] = {
            learner_id: r.learner_id,
            total_days: 0,
            present: 0,
            absent: 0,
            on_leave: 0,
            late_entry: 0,
            curfew_violations: 0,
            records: [],
          };
        }
        const entry = byLearner[r.learner_id];
        entry.total_days++;
        if (r.evening_status === 'present') entry.present++;
        else if (r.evening_status === 'absent') entry.absent++;
        else if (r.evening_status === 'on_leave') entry.on_leave++;
        else if (r.evening_status === 'late_entry') entry.late_entry++;
        if (r.is_curfew_violation) entry.curfew_violations++;
        entry.records.push(r);
      }

      return {
        report_type: 'attendance_register',
        generated_at: new Date().toISOString(),
        period: { from: dateFrom, to: dateTo },
        total_records: records.length,
        learners: Object.values(byLearner).map((l) => ({
          ...l,
          attendance_percentage: l.total_days > 0 ? Math.round((l.present / l.total_days) * 100) : 0,
          records: undefined, // Remove raw records from summary
        })),
      };
    } catch (error) {
      logger.error('campus-living/reports', 'Unexpected error in generateAttendanceRegister', error);
      throw error;
    }
  }

  // ── Visitor Register Report ───────────────────────────────────────
  static async generateVisitorRegister(
    institutionId: string,
    dateFrom: string,
    dateTo: string,
    blockId?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_visitors')
        .select('*')
        .eq('institution_id', institutionId)
        .gte('check_in_time', `${dateFrom}T00:00:00`)
        .lte('check_in_time', `${dateTo}T23:59:59`);

      if (blockId) query = query.eq('block_id', blockId);
      query = query.order('check_in_time', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      const visitors = data ?? [];

      return {
        report_type: 'visitor_register',
        generated_at: new Date().toISOString(),
        period: { from: dateFrom, to: dateTo },
        total_visitors: visitors.length,
        total_unique_visitors: new Set(visitors.map((v) => v.visitor_phone)).size,
        checked_in: visitors.filter((v) => v.status === 'checked_in').length,
        checked_out: visitors.filter((v) => v.status === 'checked_out').length,
        rejected: visitors.filter((v) => v.status === 'rejected').length,
        by_relationship: visitors.reduce((acc, v) => {
          acc[v.visitor_relationship] = (acc[v.visitor_relationship] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        visitors,
      };
    } catch (error) {
      logger.error('campus-living/reports', 'Unexpected error in generateVisitorRegister', error);
      throw error;
    }
  }

  // ── Anti-Ragging Compliance Report ────────────────────────────────
  static async generateAntiRaggingComplianceReport(institutionId: string, academicYearId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('academic_year_id', academicYearId);

      if (error) throw error;

      const affidavits = data ?? [];

      return {
        report_type: 'anti_ragging_compliance',
        generated_at: new Date().toISOString(),
        academic_year_id: academicYearId,
        total_students: affidavits.length,
        status_breakdown: {
          pending: affidavits.filter((a) => a.status === 'pending').length,
          partial: affidavits.filter((a) => a.status === 'partial').length,
          complete: affidavits.filter((a) => a.status === 'complete').length,
          verified: affidavits.filter((a) => a.status === 'verified').length,
        },
        student_affidavit_submitted: affidavits.filter((a) => a.student_affidavit_submitted).length,
        parent_affidavit_submitted: affidavits.filter((a) => a.parent_affidavit_submitted).length,
        both_submitted: affidavits.filter((a) => a.student_affidavit_submitted && a.parent_affidavit_submitted).length,
        compliance_percentage:
          affidavits.length > 0
            ? Math.round(
                (affidavits.filter((a) => a.status === 'verified' || a.status === 'complete').length / affidavits.length) * 100
              )
            : 0,
        non_compliant: affidavits
          .filter((a) => a.status === 'pending')
          .map((a) => ({ learner_id: a.learner_id, status: a.status })),
      };
    } catch (error) {
      logger.error('campus-living/reports', 'Unexpected error in generateAntiRaggingComplianceReport', error);
      throw error;
    }
  }

  // ── Safety Audit Report ───────────────────────────────────────────
  static async generateSafetyAuditReport(
    institutionId: string,
    dateFrom: string,
    dateTo: string
  ) {
    try {
      const supabase = createClientSupabaseClient();

      const [incidentsResult, inspectionsResult, maintenanceResult] = await Promise.all([
        supabase
          .from('hostel_incidents')
          .select('*')
          .eq('institution_id', institutionId)
          .gte('incident_date', dateFrom)
          .lte('incident_date', dateTo),

        supabase
          .from('hostel_inspections')
          .select('*')
          .eq('institution_id', institutionId)
          .gte('inspection_date', dateFrom)
          .lte('inspection_date', dateTo),

        supabase
          .from('hostel_maintenance_requests')
          .select('*')
          .eq('institution_id', institutionId)
          .eq('category', 'safety')
          .gte('created_at', dateFrom)
          .lte('created_at', `${dateTo}T23:59:59`),
      ]);

      const incidents = incidentsResult.data ?? [];
      const inspections = inspectionsResult.data ?? [];
      const safetyMaintenance = maintenanceResult.data ?? [];

      return {
        report_type: 'safety_audit',
        generated_at: new Date().toISOString(),
        period: { from: dateFrom, to: dateTo },
        incidents: {
          total: incidents.length,
          by_type: incidents.reduce((acc, i) => {
            acc[i.incident_type] = (acc[i.incident_type] ?? 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          by_severity: {
            critical: incidents.filter((i) => i.severity === 'critical').length,
            major: incidents.filter((i) => i.severity === 'major').length,
            moderate: incidents.filter((i) => i.severity === 'moderate').length,
            minor: incidents.filter((i) => i.severity === 'minor').length,
          },
          resolved: incidents.filter((i) => i.status === 'closed').length,
          open: incidents.filter((i) => i.status !== 'closed').length,
        },
        inspections: {
          total: inspections.length,
          by_type: inspections.reduce((acc, i) => {
            acc[i.inspection_type] = (acc[i.inspection_type] ?? 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          average_score:
            inspections.filter((i) => i.score !== null).length > 0
              ? Math.round(
                  (inspections.filter((i) => i.score !== null).reduce((s, i) => s + (i.score ?? 0), 0) /
                    inspections.filter((i) => i.score !== null).length) *
                    10
                ) / 10
              : 0,
          pending_follow_ups: inspections.filter((i) => i.follow_up_required && !i.follow_up_completed).length,
        },
        safety_maintenance: {
          total: safetyMaintenance.length,
          resolved: safetyMaintenance.filter((m) => m.status === 'resolved' || m.status === 'closed').length,
          pending: safetyMaintenance.filter((m) => !['resolved', 'closed'].includes(m.status)).length,
        },
      };
    } catch (error) {
      logger.error('campus-living/reports', 'Unexpected error in generateSafetyAuditReport', error);
      throw error;
    }
  }

  // ── Fee Collection Report ─────────────────────────────────────────
  static async generateFeeCollectionReport(institutionId: string, academicYearId?: string) {
    try {
      const supabase = createClientSupabaseClient();

      // Hostel allocations with fee status
      let allocQuery = supabase
        .from('hostel_allocations')
        .select('id, fee_status, deposit_paid, block_id, hostel_blocks(name)')
        .eq('institution_id', institutionId)
        .eq('status', 'active');

      const { data: allocations, error: allocError } = await allocQuery;
      if (allocError) throw allocError;

      // Deposits
      const { data: deposits, error: depError } = await supabase
        .from('hostel_deposits')
        .select('deposit_type, amount, status')
        .eq('institution_id', institutionId);

      if (depError) throw depError;

      // Mess billing
      const { data: messBilling, error: messError } = await supabase
        .from('mess_student_billing')
        .select('net_amount, payment_status')
        .eq('institution_id', institutionId);

      if (messError) throw messError;

      const allocs = allocations ?? [];
      const deps = deposits ?? [];
      const mess = messBilling ?? [];

      return {
        report_type: 'fee_collection',
        generated_at: new Date().toISOString(),
        hostel_fees: {
          total_active_allocations: allocs.length,
          paid: allocs.filter((a) => a.fee_status === 'paid').length,
          pending: allocs.filter((a) => a.fee_status === 'pending').length,
          partial: allocs.filter((a) => a.fee_status === 'partial').length,
          waived: allocs.filter((a) => a.fee_status === 'waived').length,
          total_deposits_collected: allocs.reduce((s, a) => s + a.deposit_paid, 0),
        },
        deposits: {
          total: deps.length,
          by_type: deps.reduce((acc, d) => {
            if (!acc[d.deposit_type]) acc[d.deposit_type] = { count: 0, amount: 0 };
            acc[d.deposit_type].count++;
            acc[d.deposit_type].amount += d.amount;
            return acc;
          }, {} as Record<string, { count: number; amount: number }>),
          paid: deps.filter((d) => d.status === 'paid').length,
          refunded: deps.filter((d) => d.status === 'refunded').length,
        },
        mess_billing: {
          total_billed: mess.reduce((s, m) => s + m.net_amount, 0),
          paid: mess.filter((m) => m.payment_status === 'paid').length,
          pending: mess.filter((m) => m.payment_status === 'pending').length,
          overdue: mess.filter((m) => m.payment_status === 'overdue').length,
        },
      };
    } catch (error) {
      logger.error('campus-living/reports', 'Unexpected error in generateFeeCollectionReport', error);
      throw error;
    }
  }
}
