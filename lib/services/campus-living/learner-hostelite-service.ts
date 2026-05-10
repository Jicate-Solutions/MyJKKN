// Service for the "learner hostelite" surface on /campus-living/residents.
//
// Source of truth: `v_learner_hostelites` view (PR pending — bugs BUG-003325 +
// BUG-003326). The view JOINs learners_profiles → admission_years (for computed
// year_of_study) and LEFT JOINs hostel_allocations status='active' (for
// current block_id/room_id/bed_id). It enables filter pushdown for the 4 new
// filters added to the Learners tab: institution / year / gender / block.
//
// MUTATIONS still target `learners_profiles` directly — the view is read-only.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  UNASSIGNED_BLOCK,
  type LearnerHostelite,
  type LearnerHostelitesFilters,
  type LearnerHostelType,
  type LearnerDetailBundle,
  type LearnerHostelProfile,
  type LearnerCurrentAllocation,
  type LearnerGatePassSummary,
  type LearnerAttendanceSummary,
  type LearnerVacateRequestSummary,
} from '@/types/campus-living';

const VIEW_SELECT = [
  'id',
  'first_name',
  'last_name',
  'student_email',
  'college_email',
  'roll_number',
  'gender',
  'father_name',
  'mother_name',
  'accommodation_type',
  'hostel_type',
  'hostel_fee',
  'dayscholar_fee',
  'institution_id',
  'admission_year_id',
  'year_of_study',
  'current_block_id',
  'current_room_id',
  'current_bed_id',
  'current_allocation_id',
].join(',');

// learners_profiles columns NOT exposed on the view (used by mutations and the
// candidate search since those still need to read department_id/program_id).
const LEARNER_TABLE_SELECT = [
  'id',
  'first_name',
  'last_name',
  'student_email',
  'college_email',
  'roll_number',
  'gender',
  'father_name',
  'mother_name',
  'accommodation_type',
  'hostel_type',
  'hostel_fee',
  'dayscholar_fee',
  'institution_id',
  'department_id',
  'program_id',
].join(',');

export class LearnerHosteliteService {
  // ── List ──────────────────────────────────────────────────────────────
  //
  // institutionId:
  //   - undefined → super_admin view (no auto institution filter)
  //   - string    → filter to that institution (overrides filters.institution_id)
  //
  // filters.institution_id is honored ONLY when institutionId is undefined
  // (super_admin picking an institution from the dropdown). Non-super-admins
  // can't widen scope past their own institution.
  static async listHostelites(
    institutionId: string | undefined,
    filters?: LearnerHostelitesFilters,
    page = 1,
    pageSize = 100,
  ): Promise<{ data: LearnerHostelite[]; count: number }> {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('v_learner_hostelites')
        .select(VIEW_SELECT, { count: 'exact' });

      // Institution scoping — non-super-admin always restricted to their inst.
      // Super-admin can pass filters.institution_id to narrow.
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      } else if (filters?.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters?.hostel_type)
        query = query.eq('hostel_type', filters.hostel_type);

      if (filters?.year_of_study !== undefined && filters.year_of_study !== null)
        query = query.eq('year_of_study', filters.year_of_study);

      if (filters?.gender)
        query = query.eq('gender', filters.gender);

      // Block filter: explicit UUID → match it. UNASSIGNED → IS NULL on the
      // view's current_block_id (LEFT JOIN result for learners with no active
      // allocation row).
      if (filters?.block_id) {
        if (filters.block_id === UNASSIGNED_BLOCK) {
          query = query.is('current_block_id', null);
        } else {
          query = query.eq('current_block_id', filters.block_id);
        }
      }

      if (filters?.search) {
        const s = filters.search.trim();
        if (s) {
          query = query.or(
            `roll_number.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,student_email.ilike.%${s}%`,
          );
        }
      }

      const from = (page - 1) * pageSize;
      query = query
        .order('roll_number', { ascending: true })
        .range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/learner-hostelite', 'listHostelites failed', error);
        throw error;
      }
      return { data: (data ?? []) as LearnerHostelite[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in listHostelites', error);
      throw error;
    }
  }

  // ── Block list for filter dropdown ───────────────────────────────────
  // Returns blocks the user can see (per RLS on hostel_blocks). Used to
  // populate the Block filter dropdown — all blocks for accessible
  // institutions, plus the "Unassigned" sentinel handled in UI.
  static async listBlocksForFilter(
    institutionId?: string,
  ): Promise<Array<{ id: string; name: string; code: string; institution_id: string }>> {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_blocks')
        .select('id,name,code,institution_id')
        .order('name', { ascending: true });
      if (institutionId) query = query.eq('institution_id', institutionId);
      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/learner-hostelite', 'listBlocksForFilter failed', error);
        throw error;
      }
      return data ?? [];
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in listBlocksForFilter', error);
      throw error;
    }
  }

  // ── Detail bundle (BUG-003326) ────────────────────────────────────────
  // Parallel-fetch for the read-only detail drawer triggered by row-click.
  // 6 independent queries fired via Promise.all:
  //   1. learner row from v_learner_hostelites (with year_of_study + alloc FKs)
  //   2. hostel profile (learner_hostel_profiles)
  //   3. current allocation + JOIN block/room/bed for display names
  //   4. last 5 gate-passes
  //   5. last 5 attendance entries
  //   6. open vacate request (any non-completed/cancelled status)
  //
  // Leaves dropped per /assumption-thrash Round 1 #2 — no /campus-living/leaves
  // route exists yet for the "View all" link.
  static async getLearnerDetailBundle(learnerId: string): Promise<LearnerDetailBundle> {
    try {
      const supabase = createClientSupabaseClient();

      const [
        learnerRes,
        profileRes,
        allocRes,
        gpRes,
        attRes,
        vacRes,
      ] = await Promise.all([
        supabase
          .from('v_learner_hostelites')
          .select(VIEW_SELECT)
          .eq('id', learnerId)
          .maybeSingle(),
        supabase
          .from('learner_hostel_profiles')
          .select('*')
          .eq('learner_id', learnerId)
          .maybeSingle(),
        supabase
          .from('hostel_allocations')
          .select(
            'id, block_id, room_id, bed_id, allocation_date, expected_vacate_date, status, ' +
              'block:hostel_blocks!block_id(name,code), ' +
              'room:hostel_rooms!room_id(room_number), ' +
              'bed:hostel_beds!bed_id(bed_number)',
          )
          .eq('learner_id', learnerId)
          .eq('status', 'active')
          .order('allocation_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('hostel_gate_passes')
          .select('id, pass_number, status, out_time, in_time, purpose, created_at')
          .eq('learner_id', learnerId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('hostel_attendance')
          .select('id, date, status, marked_at')
          .eq('learner_id', learnerId)
          .order('date', { ascending: false })
          .limit(5),
        supabase
          .from('hostel_vacate_requests')
          .select('id, status, reason, effective_date, created_at')
          .eq('learner_id', learnerId)
          .not('status', 'in', '(completed,cancelled,rejected)')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (learnerRes.error || !learnerRes.data) {
        throw learnerRes.error ?? new Error('Learner not found');
      }

      const learner = learnerRes.data as LearnerHostelite;
      const hostelProfile = (profileRes.data as LearnerHostelProfile | null) ?? null;

      // Allocation bundle — flatten the joined names
      let currentAllocation: LearnerCurrentAllocation | null = null;
      if (allocRes.data) {
        type Joined = {
          id: string;
          block_id: string;
          room_id: string;
          bed_id: string;
          allocation_date: string;
          expected_vacate_date: string | null;
          status: LearnerCurrentAllocation['status'];
          block?: { name: string | null; code: string | null } | null;
          room?: { room_number: string | null } | null;
          bed?: { bed_number: string | null } | null;
        };
        const a = allocRes.data as unknown as Joined;
        currentAllocation = {
          id: a.id,
          block_id: a.block_id,
          block_name: a.block?.name ?? null,
          block_code: a.block?.code ?? null,
          room_id: a.room_id,
          room_number: a.room?.room_number ?? null,
          bed_id: a.bed_id,
          bed_number: a.bed?.bed_number ?? null,
          allocation_date: a.allocation_date,
          expected_vacate_date: a.expected_vacate_date,
          status: a.status,
        };
      }

      const recentGatePasses = (gpRes.data ?? []) as LearnerGatePassSummary[];
      const recentAttendance = (attRes.data ?? []) as LearnerAttendanceSummary[];
      const openVacateRequest = (vacRes.data as LearnerVacateRequestSummary | null) ?? null;

      return {
        learner,
        hostelProfile,
        currentAllocation,
        recentGatePasses,
        recentAttendance,
        openVacateRequest,
      };
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'getLearnerDetailBundle failed', error);
      throw error;
    }
  }

  // ── Remove from hostel ────────────────────────────────────────────────
  // Flips accommodation_type to 'DAY SCHOLAR' on the underlying table (NOT the
  // view). Caller is responsible for cancelling/vacating any active allocation.
  static async removeFromHostel(learnerId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('learners_profiles')
        .update({ accommodation_type: 'DAY SCHOLAR' })
        .eq('id', learnerId);
      if (error) {
        logger.error('campus-living/learner-hostelite', 'removeFromHostel failed', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in removeFromHostel', error);
      throw error;
    }
  }

  // ── Add a learner to hostel ───────────────────────────────────────────
  static async addToHostel(
    learnerId: string,
    hostelType: LearnerHostelType = null,
  ): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const payload: { accommodation_type: 'HOSTEL'; hostel_type?: LearnerHostelType } = {
        accommodation_type: 'HOSTEL',
      };
      if (hostelType) payload.hostel_type = hostelType;
      const { error } = await supabase
        .from('learners_profiles')
        .update(payload)
        .eq('id', learnerId);
      if (error) {
        logger.error('campus-living/learner-hostelite', 'addToHostel failed', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in addToHostel', error);
      throw error;
    }
  }

  // ── Search candidate learners for the "Add to Hostel" picker ─────────
  // Reads from learners_profiles (NOT the view) since candidates are by
  // definition non-HOSTEL learners who aren't in the view's WHERE clause.
  static async searchCandidates(
    institutionId: string | undefined,
    search: string,
    limit = 20,
  ): Promise<LearnerHostelite[]> {
    try {
      const s = search.trim();
      if (s.length < 2) return [];
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('learners_profiles')
        .select(LEARNER_TABLE_SELECT)
        .neq('accommodation_type', 'HOSTEL')
        .or(
          `roll_number.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,student_email.ilike.%${s}%`,
        )
        .limit(limit);
      if (institutionId) query = query.eq('institution_id', institutionId);
      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/learner-hostelite', 'searchCandidates failed', error);
        throw error;
      }
      return (data ?? []) as LearnerHostelite[];
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in searchCandidates', error);
      throw error;
    }
  }
}
