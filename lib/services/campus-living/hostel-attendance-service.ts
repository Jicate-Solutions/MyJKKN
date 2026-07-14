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

      // Scope is enforced by RLS, NOT by an institution_id filter here:
      //  - hostel_residents NO LONGER HAS institution_id (dropped in
      //    hostel-rooms-v2 PR2). Filtering it by institution_id raised
      //    42703 (column does not exist) for every institution-scoped user
      //    — only super-admins (who pass institutionId=undefined) escaped it,
      //    which is why wardens saw an empty roster. RLS scopes residents via
      //    role_has_hostel_block_scope (block grants) + the unallocated branch.
      //  - hostel_allocations IS scoped server-side by role_has_block_access,
      //    so a block warden whose blocks belong to ANOTHER institution (the
      //    common cross-institution case) still gets their rows. Filtering by
      //    the marker's own profile institution_id wrongly hid those.
      const residentsQ = supabase
        .from('hostel_residents')
        .select(
          'id, profile_id, id_proof_number, profile:profiles!hostel_residents_profile_id_fkey(id, full_name, email, institution_id, avatar_url)'
        )
        .eq('is_active', true)
        .limit(1000);

      const allocQ = supabase
        .from('hostel_allocations')
        .select(
          'learner_id, block_id, room_id, bed_id, block:hostel_blocks!hostel_allocations_block_id_fkey(id, name, code), room:hostel_rooms!hostel_allocations_room_id_fkey(id, room_number, floor, category_id, category:hostel_categories(id, name, sort_order)), bed:hostel_beds!hostel_allocations_bed_id_fkey(id, bed_number), learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email, institution_id, avatar_url)'
        )
        .eq('status', 'active')
        .limit(1000);

      // Real student photos live in learners_profiles.student_photo_url, NOT
      // profiles.avatar_url (NULL for ~all students). learners_profiles SELECT
      // RLS blocks block-scoped wardens from reading their own cross-college
      // residents, so this goes through a SECURITY DEFINER RPC that self-authorizes
      // on the caller's block/institution access and returns only the (public-bucket)
      // photo URL. Failure is non-fatal — the roster still renders with initials.
      const photosQ = supabase.rpc('get_markable_resident_photos', {
        p_block_id: blockId ?? null,
      });

      const [residents, allocs, photos] = await Promise.all([residentsQ, allocQ, photosQ]);
      if (residents.error) {
        logger.error('campus-living/attendance', 'Failed to fetch markable residents', residents.error);
        throw residents.error;
      }
      if (allocs.error) {
        logger.error('campus-living/attendance', 'Failed to fetch resident allocations', allocs.error);
        throw allocs.error;
      }
      if (photos.error) {
        // Non-fatal: log and fall back to initials rather than failing the roster.
        logger.error('campus-living/attendance', 'Failed to fetch resident photos', photos.error);
      }

      const photoByProfile = new Map<string, string>(
        ((photos.data ?? []) as Array<{ profile_id: string; student_photo_url: string }>).map(
          (p) => [p.profile_id, p.student_photo_url]
        )
      );

      const allocRows = (allocs.data ?? []) as unknown as MarkableResidentAllocation[];
      const byLearner = new Map(allocRows.map((a) => [a.learner_id, a]));
      const merged: MarkableResident[] = ((residents.data ?? []) as unknown as Array<
        Omit<MarkableResident, 'allocation' | 'student_photo_url'>
      >).map((r) => ({
        ...r,
        allocation: byLearner.get(r.profile_id) ?? null,
        student_photo_url: photoByProfile.get(r.profile_id) ?? null,
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
            student_photo_url: photoByProfile.get(a.learner_id) ?? null,
          });
        }
      }

      const list = blockId
        ? merged.filter((m) => m.allocation?.block_id === blockId)
        : merged;
      // Roll-call order: block, then floor, then room number, then name;
      // unallocated last. Floor must sort ahead of room number — room
      // numbers alone don't reliably encode floor (e.g. reused "1", "2"
      // per floor), which previously let rooms from different floors
      // interleave instead of walking the block floor-by-floor.
      return list.sort((x, y) => {
        const bx = x.allocation?.block?.name ?? '￿';
        const by = y.allocation?.block?.name ?? '￿';
        if (bx !== by) return bx.localeCompare(by);
        const fx = x.allocation?.room?.floor ?? Infinity;
        const fy = y.allocation?.room?.floor ?? Infinity;
        if (fx !== fy) return fx - fy;
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

  // ── Dashboard aggregate for the Hostel Attendance landing page ────
  // The dashboard page reads an AGGREGATE shape (total_hostellers, present,
  // blocks[], weekly_trend[], …). getAttendance returns a raw row list, so the
  // page used to fall back to all-zeros forever. This computes the real shape.
  //
  // Scope is RLS-enforced (block access on hostel_attendance/hostel_allocations);
  // no profile-institution filter — see getMarkableResidents for why that breaks
  // cross-institution wardens. institutionId is kept only for the hook's cache
  // key / enabled gate.
  static async getAttendanceDashboard(
    institutionId: string | undefined,
    date: string,
    blockId?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();

      // Date math in UTC so an IST (+5:30) midnight never rolls back a day.
      const parts = (s: string) => s.split('-').map(Number) as [number, number, number];
      const addDays = (s: string, n: number) => {
        const [y, m, d] = parts(s);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() + n);
        return dt.toISOString().split('T')[0];
      };
      const weekdayLabel = (s: string) => {
        const [y, m, d] = parts(s);
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
          new Date(Date.UTC(y, m - 1, d)).getUTCDay()
        ];
      };
      const weekStart = addDays(date, -6);

      // Active allocations = the hosteller population (one bed = one hosteller).
      let allocQ = supabase
        .from('hostel_allocations')
        .select('block_id, block:hostel_blocks!hostel_allocations_block_id_fkey(id, name, code)')
        .eq('status', 'active')
        .limit(5000);
      if (blockId) allocQ = allocQ.eq('block_id', blockId);

      let attQ = supabase
        .from('hostel_attendance')
        .select('block_id, evening_status, is_curfew_violation')
        .eq('date', date)
        .limit(5000);
      if (blockId) attQ = attQ.eq('block_id', blockId);

      let weekQ = supabase
        .from('hostel_attendance')
        .select('date, evening_status')
        .gte('date', weekStart)
        .lte('date', date)
        .limit(20000);
      if (blockId) weekQ = weekQ.eq('block_id', blockId);

      const [allocs, att, week] = await Promise.all([allocQ, attQ, weekQ]);
      if (allocs.error) throw allocs.error;
      if (att.error) throw att.error;
      if (week.error) throw week.error;

      type AllocRow = { block_id: string | null; block: { id: string; name: string; code: string } | null };
      type AttRow = { block_id: string | null; evening_status: HostelAttendanceStatus | null; is_curfew_violation: boolean | null };

      const allocRows = (allocs.data ?? []) as unknown as AllocRow[];
      const attRows = (att.data ?? []) as unknown as AttRow[];

      type BlockStat = { id: string; name: string; code: string; total: number; present: number; absent: number; on_leave: number; marked: boolean };
      const blocks = new Map<string, BlockStat>();
      const blockOf = (id: string, name = '—', code = ''): BlockStat => {
        const existing = blocks.get(id);
        if (existing) return existing;
        const fresh: BlockStat = { id, name, code, total: 0, present: 0, absent: 0, on_leave: 0, marked: false };
        blocks.set(id, fresh);
        return fresh;
      };

      // Seed block totals from the allocation population so blocks with zero
      // marks still render (with a "Not Marked" badge).
      for (const a of allocRows) {
        if (!a.block_id) continue;
        blockOf(a.block_id, a.block?.name ?? '—', a.block?.code ?? '').total += 1;
      }

      let present = 0, absent = 0, on_leave = 0, late_entry = 0, curfew = 0;
      for (const r of attRows) {
        if (r.evening_status === 'present') present += 1;
        else if (r.evening_status === 'absent') absent += 1;
        else if (r.evening_status === 'on_leave') on_leave += 1;
        else if (r.evening_status === 'late_entry') late_entry += 1;
        if (r.is_curfew_violation) curfew += 1;
        if (r.block_id) {
          const b = blockOf(r.block_id);
          b.marked = true;
          if (r.evening_status === 'present') b.present += 1;
          else if (r.evening_status === 'absent') b.absent += 1;
          else if (r.evening_status === 'on_leave') b.on_leave += 1;
        }
      }

      const denom = present + absent + on_leave + late_entry;
      const attendance_rate = denom > 0 ? Math.round((present / denom) * 100) : 0;

      const trend = new Map<string, { day: string; present: number; absent: number }>();
      for (let i = 0; i < 7; i++) {
        const key = addDays(weekStart, i);
        trend.set(key, { day: weekdayLabel(key), present: 0, absent: 0 });
      }
      for (const r of (week.data ?? []) as { date: string; evening_status: HostelAttendanceStatus | null }[]) {
        const t = trend.get(r.date);
        if (!t) continue;
        if (r.evening_status === 'present') t.present += 1;
        else if (r.evening_status === 'absent') t.absent += 1;
      }

      return {
        date,
        total_hostellers: allocRows.length,
        present,
        absent,
        on_leave,
        late_entry,
        attendance_rate,
        curfew_violations: curfew,
        blocks: Array.from(blocks.values()).sort((a, b) => a.name.localeCompare(b.name)),
        weekly_trend: Array.from(trend.values()),
      };
    } catch (error) {
      logger.error('campus-living/attendance', 'Unexpected error in getAttendanceDashboard', error);
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
        .upsert(payload, { onConflict: 'learner_id,date' })
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
        .upsert(records, { onConflict: 'learner_id,date' })
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
