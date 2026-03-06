// lib/services/academic/facilitator-attendance-service.ts
// Created: 2026-03-06

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  FacilitatorReportFilters,
  FacilitatorReportData,
  FacilitatorReportRaw,
} from '@/types/attendance';

export class FacilitatorAttendanceService {
  static async getReport(
    institutionId: string,
    filters: FacilitatorReportFilters
  ): Promise<FacilitatorReportData> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase.rpc(
      'get_facilitator_attendance_stats',
      {
        p_institution_id:  institutionId,
        p_date_from:       filters.dateFrom,
        p_date_to:         filters.dateTo,
        p_department_id:   filters.departmentId   ?? null,
        p_program_id:      filters.programId      ?? null,
        p_semester_id:     filters.semesterId     ?? null,
        p_facilitator_id:  filters.facilitatorId  ?? null,
      }
    );

    if (error) throw new Error(error.message);

    const raw = data as FacilitatorReportRaw;

    return {
      summary: {
        totalFacilitators:        raw.summary.total_facilitators,
        totalPeriodsMarked:       raw.summary.total_periods_marked,
        avgPeriodsPerFacilitator: raw.summary.avg_periods_per_facilitator,
      },
      facilitators: (raw.facilitators ?? []).map((f) => ({
        staffId:        f.staff_id,
        firstName:      f.first_name,
        lastName:       f.last_name,
        designation:    f.designation,
        departmentName: f.department_name,
        departmentId:   f.department_id,
        periodsMarked:  f.periods_marked,
        lastMarkedAt:   f.last_marked_at,
        trendData:      (f.trend_data ?? []).map((t) => ({ week: t.week, count: t.count })),
        dailyData:      (f.daily_data ?? []).map((d) => ({ date: d.date, count: d.count })),
      })),
      departmentBreakdown: (raw.department_breakdown ?? []).map((d) => ({
        departmentId:     d.department_id,
        departmentName:   d.department_name,
        facilitatorCount: d.facilitator_count,
        totalMarked:      d.total_marked,
        avgRate:          d.avg_rate,
      })),
    };
  }
}
