import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelAttendance,
  CreateHostelAttendanceDTO,
  AttendanceFilters,
  HostelAttendanceStatus,
  MarkableResident,
  MarkableResidentAllocation,
} from '@/types/campus-living';

export class HostelAttendanceService {
  // ── List attendance with filters ──────────────────────────────────
  // History page passes (block_id?, date?, date_from?, date_to?, learner_id?).
  // The relation columns (`learner`, `block`) are joined here so the history
  // table can render a friendly Learner + Block label without a second query
  // per row — service was previously raw-only which left the page rendering
  // `record.block ?? '-'` against `block_id` (a UUID) and a missing learner
  // name entirely. Joining via the existing FK constraints is cheap.
  static async getAttendance(
    institutionId: string | undefined,
    filters?: AttendanceFilters,
    page = 1,
    pageSize = 100
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const extended = filters as
        | (AttendanceFilters & { learner_id?: string; date_from?: string; date_to?: string })
        | undefined;
      let query = supabase
        .from('hostel_attendance')
        .select(
          '*, learner:profiles!hostel_attendance_learner_id_fkey(id, full_name, email), block:hostel_blocks!block_id(id, name, code), marker:profiles!hostel_attendance_marked_by_fkey(id, full_name, email)',
          { count: 'exact' }
        );

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.date) query = query.eq('date', filters.date);
      if (filters?.status) query = query.eq('evening_status', filters.status);
      // Optional learner narrowing — used by deep-links from the residents
      // detail drawer (`/campus-living/attendance/history?learner=<id>`).
      if (extended?.learner_id) {
        query = query.eq('learner_id', extended.learner_id);
      }
      // Optional date-range narrowing — used by the history page's From/To
      // pickers. Existing `date` (exact-match) still wins when supplied.
      if (!filters?.date && extended?.date_from) {
        query = query.gte('date', extended.date_from);
      }
      if (!filters?.date && extended?.date_to) {
        query = query.lte('date', extended.date_to);
      }

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

  // ── Current user's block grants (warden scoping) ──────────────────
  // user_block_access is self-readable under RLS and is auto-synced from
  // hostel_wardens by trg_hostel_wardens_block_access, so an active warden's
  // assigned blocks land here. A non-empty result means the user is
  // block-scoped: the Mark Attendance UI restricts blocks/residents to these
  // (RLS on hostel_attendance/hostel_allocations enforces the same
  // role_has_block_access(block_id) server-side).
  static async getMyBlockGrants(): Promise<string[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_block_access')
        .select('block_id')
        .eq('user_id', user.id)
        .is('revoked_at', null);
      if (error) {
        logger.error('campus-living/attendance', 'Failed to fetch own block grants', error);
        throw error;
      }
      return (data ?? []).map((r) => r.block_id).filter(Boolean);
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in getMyBlockGrants', error);
      throw error;
    }
  }

  // ── Residents to mark, with live allocation context ───────────────
  // The Mark Attendance page needs each active resident's block/room/bed so
  // staff can filter by block and recognise who they're marking.
  // hostel_residents has no FK to hostel_allocations — the learner's active
  // allocation (keyed on profiles.id == hostel_residents.profile_id) is
  // merged in here. Residents without an active allocation still appear
  // (so they remain markable) but only under "All blocks".
  static async getMarkableResidents(institutionId?: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();

      let residentsQ = supabase
        .from('hostel_residents')
        .select(
          'id, profile_id, id_proof_number, profile:profiles!hostel_residents_profile_id_fkey(id, full_name, email)'
        )
        .eq('is_active', true)
        .limit(1000);
      if (institutionId) residentsQ = residentsQ.eq('institution_id', institutionId);

      let allocQ = supabase
        .from('hostel_allocations')
        .select(
          'learner_id, block_id, room_id, bed_id, block:hostel_blocks!hostel_allocations_block_id_fkey(id, name, code), room:hostel_rooms!hostel_allocations_room_id_fkey(id, room_number, floor), bed:hostel_beds!hostel_allocations_bed_id_fkey(id, bed_number), learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email)'
        )
        .eq('status', 'active')
        .limit(1000);
      if (institutionId) allocQ = allocQ.eq('institution_id', institutionId);

      const [residents, allocs] = await Promise.all([residentsQ, allocQ]);
      if (residents.error) {
        logger.error('campus-living/attendance', 'Failed to fetch markable residents', residents.error);
        throw residents.error;
      }
      if (allocs.error) {
        logger.error('campus-living/attendance', 'Failed to fetch resident allocations', allocs.error);
        throw allocs.error;
      }

      const allocRows = (allocs.data ?? []) as unknown as MarkableResidentAllocation[];
      const byLearner = new Map(allocRows.map((a) => [a.learner_id, a]));
      const merged: MarkableResident[] = ((residents.data ?? []) as unknown as Array<
        Omit<MarkableResident, 'allocation'>
      >).map((r) => ({
        ...r,
        allocation: byLearner.get(r.profile_id) ?? null,
      }));

      // Allocated learners with no hostel_residents row (e.g. auto-allocated
      // before the residents sync) must still be markable — synthesise a row
      // from the allocation. learner_id doubles as the stable row id.
      const residentProfileIds = new Set(merged.map((m) => m.profile_id));
      for (const a of allocRows) {
        if (!residentProfileIds.has(a.learner_id)) {
          merged.push({
            id: a.learner_id,
            profile_id: a.learner_id,
            id_proof_number: null,
            profile: a.learner ?? null,
            allocation: a,
          });
        }
      }

      const list = blockId
        ? merged.filter((m) => m.allocation?.block_id === blockId)
        : merged;
      // Roll-call order: block, then room, then name; unallocated last.
      return list.sort((x, y) => {
        const bx = x.allocation?.block?.name ?? '￿';
        const by = y.allocation?.block?.name ?? '￿';
        if (bx !== by) return bx.localeCompare(by);
        const rx = x.allocation?.room?.room_number ?? '￿';
        const ry = y.allocation?.room?.room_number ?? '￿';
        if (rx !== ry) return rx.localeCompare(ry, undefined, { numeric: true });
        return (x.profile?.full_name ?? '').localeCompare(y.profile?.full_name ?? '');
      });
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in getMarkableResidents', error);
      throw error;
    }
  }

  // ── Attendance for a specific date and block ──────────────────────
  static async getAttendanceByDate(institutionId: string | undefined, date: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_attendance')
        .select('*, learner:profiles!hostel_attendance_learner_id_fkey(id, full_name, email)')
        .eq('date', date);

      if (institutionId) query = query.eq('institution_id', institutionId);
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
  static async getAbsentLearners(institutionId: string | undefined, date: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_attendance')
        .select('*')
        .eq('date', date)
        .in('evening_status', ['absent']);

      if (institutionId) query = query.eq('institution_id', institutionId);
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
  static async getAttendanceSummary(institutionId: string | undefined, date: string, blockId?: string) {
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
    institutionId: string | undefined,
    learnerId: string,
    days = 3
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let q = supabase
        .from('hostel_attendance')
        .select('*')
        .eq('learner_id', learnerId)
        .eq('evening_status', 'absent')
        .order('date', { ascending: false })
        .limit(days);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;

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
