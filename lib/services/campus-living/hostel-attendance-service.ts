import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelAttendance,
  CreateHostelAttendanceDTO,
  AttendanceFilters,
  HostelAttendanceStatus,
} from '@/types/campus-living';

export class HostelAttendanceService {
  // ── List attendance with filters ──────────────────────────────────
  static async getAttendance(
    institutionId: string,
    filters?: AttendanceFilters,
    page = 1,
    pageSize = 100
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_attendance')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.date) query = query.eq('date', filters.date);
      if (filters?.status) query = query.eq('evening_status', filters.status);

      const from = (page - 1) * pageSize;
      query = query.order('date', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/attendance', 'Failed to fetch attendance', error);
        throw error;
      }
      return { data: data as HostelAttendance[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in getAttendance', error);
      throw error;
    }
  }

  // ── Attendance for a specific date and block ──────────────────────
  static async getAttendanceByDate(institutionId: string, date: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_attendance')
        .select('*, learner:users_profiles!learner_id(id, full_name, email)')
        .eq('institution_id', institutionId)
        .eq('date', date);

      if (blockId) query = query.eq('block_id', blockId);
      query = query.order('learner_id');

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/attendance', 'Failed to fetch attendance by date', error);
        throw error;
      }
      return data as HostelAttendance[];
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in getAttendanceByDate', error);
      throw error;
    }
  }

  // ── Attendance for a specific learner ─────────────────────────────
  static async getAttendanceByLearner(
    learnerId: string,
    dateFrom?: string,
    dateTo?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_attendance')
        .select('*')
        .eq('learner_id', learnerId);

      if (dateFrom) query = query.gte('date', dateFrom);
      if (dateTo) query = query.lte('date', dateTo);
      query = query.order('date', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/attendance', 'Failed to fetch attendance by learner', error);
        throw error;
      }
      return data as HostelAttendance[];
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in getAttendanceByLearner', error);
      throw error;
    }
  }

  // ── Mark single attendance ────────────────────────────────────────
  static async markAttendance(payload: CreateHostelAttendanceDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_attendance')
        .upsert(payload, { onConflict: 'institution_id,learner_id,date' })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/attendance', 'Failed to mark attendance', error);
        throw error;
      }
      return data as HostelAttendance;
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in markAttendance', error);
      throw error;
    }
  }

  // ── Bulk mark attendance ──────────────────────────────────────────
  static async bulkMarkAttendance(records: CreateHostelAttendanceDTO[]) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_attendance')
        .upsert(records, { onConflict: 'institution_id,learner_id,date' })
        .select();

      if (error) {
        logger.error('campus-living/attendance', 'Failed to bulk mark attendance', error);
        throw error;
      }
      return data as HostelAttendance[];
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in bulkMarkAttendance', error);
      throw error;
    }
  }

  // ── Update attendance ─────────────────────────────────────────────
  static async updateAttendance(
    id: string,
    payload: Partial<CreateHostelAttendanceDTO>
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_attendance')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/attendance', 'Failed to update attendance', error);
        throw error;
      }
      return data as HostelAttendance;
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in updateAttendance', error);
      throw error;
    }
  }

  // ── Delete attendance ─────────────────────────────────────────────
  static async deleteAttendance(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_attendance')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/attendance', 'Failed to delete attendance', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in deleteAttendance', error);
      throw error;
    }
  }

  // ── Absent learners for a date (absence alerts) ───────────────────
  static async getAbsentLearners(institutionId: string, date: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_attendance')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('date', date)
        .in('evening_status', ['absent']);

      if (blockId) query = query.eq('block_id', blockId);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/attendance', 'Failed to fetch absent learners', error);
        throw error;
      }
      return data as HostelAttendance[];
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in getAbsentLearners', error);
      throw error;
    }
  }

  // ── Attendance summary for a date ─────────────────────────────────
  static async getAttendanceSummary(institutionId: string, date: string, blockId?: string) {
    try {
      const records = await this.getAttendanceByDate(institutionId, date, blockId);

      const summary = {
        total: records.length,
        present: records.filter((r) => r.evening_status === 'present').length,
        absent: records.filter((r) => r.evening_status === 'absent').length,
        on_leave: records.filter((r) => r.evening_status === 'on_leave').length,
        late_entry: records.filter((r) => r.evening_status === 'late_entry').length,
        medical: records.filter((r) => r.evening_status === 'medical').length,
        curfew_violations: records.filter((r) => r.is_curfew_violation).length,
      };

      return summary;
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in getAttendanceSummary', error);
      throw error;
    }
  }

  // ── Consecutive absence check (for alerts) ────────────────────────
  static async getConsecutiveAbsences(
    institutionId: string,
    learnerId: string,
    days = 3
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_attendance')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('learner_id', learnerId)
        .eq('evening_status', 'absent')
        .order('date', { ascending: false })
        .limit(days);

      if (error) {
        logger.error('campus-living/attendance', 'Failed to check consecutive absences', error);
        throw error;
      }
      return {
        records: data as HostelAttendance[],
        consecutive_absent: data?.length ?? 0,
        is_alert: (data?.length ?? 0) >= days,
      };
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in getConsecutiveAbsences', error);
      throw error;
    }
  }
}
