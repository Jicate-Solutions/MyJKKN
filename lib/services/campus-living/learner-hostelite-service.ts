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
import { accommodationLegacyFromCode } from '@/lib/utils/accommodation-type-resolver';
import {
  UNASSIGNED_BLOCK,
  type HosteliteBillStatus,
  type LearnerBillItem,
  type LearnerHostelite,
  type LearnerHostelitesFilters,
  type LearnerDetailBundle,
  type LearnerHostelProfile,
  type LearnerCurrentAllocation,
  type LearnerGatePassSummary,
  type LearnerAttendanceSummary,
  type LearnerVacateRequestSummary,
  type LearnerLeaveSummary,
  type UnallocatedCandidate,
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
  // Contact numbers for the roster export (migration 20260902140000). Both the
  // base view and v_learner_hostelites_scoped project these — the scoped view's
  // `SELECT v.*` had to be re-expanded to pick them up, since Postgres freezes
  // the star at creation time.
  'student_mobile',
  'father_mobile',
  'mother_mobile',
  'accommodation_type',
  'hostel_fee',
  'dayscholar_fee',
  'institution_id',
  'admission_year_id',
  'year_of_study',
  // The cohort year behind admission_year_id. Selected as well as the id
  // because admission_years is per-institution: the id differs per college for
  // the same cohort, the year does not.
  'program_start_year',
  'current_block_id',
  'current_room_id',
  'current_bed_id',
  'current_allocation_id',
  // Advanced-table additions
  'degree_id',
  'department_id',
  'program_id',
  'semester_id',
  'section_id',
  'academic_year_id',
  'program_name',
  'current_block_name',
  'current_block_code',
  'current_room_number',
  'current_bed_number',
  'degree_name',
  'semester_name',
  'academic_year_name',
  'lifecycle_status',
  // Current room/mess categories (admin Category Upgrade tab — 2026-06-17)
  'hostel_category_id',
  'hostel_category_name',
  'hostel_category_type',
  'mess_category_id',
  'mess_category_name',
].join(',');

// learners_profiles columns NOT exposed on the view (used by mutations and the
// candidate search since those still need to read department_id/program_id).
// accommodation_type TEXT is retired — embed accommodation_types and derive the
// legacy 'HOSTEL'/'DAY SCHOLAR' value in JS (see searchCandidates).
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
  'accommodation_type_id',
  'accommodation_ref:accommodation_types!accommodation_type_id(code,name)',
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
      // Query the SCOPED view, not the base view. v_learner_hostelites bypasses
      // RLS, so this client-side query must hit v_learner_hostelites_scoped,
      // which re-derives the caller's scope from auth.uid() server-side
      // (super-admin → all; block warden → their granted blocks; else →
      // accessible institutions). This is the non-forgeable authorization
      // boundary — see migration 20260624180000. Cast to `any` because the
      // view isn't in the generated Supabase types (same pattern as before).
      let query = (supabase as any)
        .from('v_learner_hostelites_scoped')
        .select(VIEW_SELECT, { count: 'exact' });

      // Institution scoping — non-super-admin always restricted to their inst.
      // Super-admin can pass filters.institution_id to narrow.
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      } else if (filters?.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters?.year_of_study !== undefined && filters.year_of_study !== null)
        query = query.eq('year_of_study', filters.year_of_study);

      // Admission cohort. Composes with year_of_study rather than replacing it:
      // the two answer different questions (which intake vs how far through).
      if (filters?.admission_year !== undefined && filters.admission_year !== null)
        query = query.eq('program_start_year', filters.admission_year);

      if (filters?.gender)
        // Case-insensitive match — chip values are TitleCase ('Male'/'Female'/
        // 'Other') but prod data is lowercase ('male'/'female'). `.eq()` was
        // case-sensitive → 0 rows. `.ilike()` with no wildcards is an exact
        // case-insensitive match, tolerant of DB casing drift either way.
        query = query.ilike('gender', filters.gender);

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

      // Optional client-side narrowing to a subset of blocks (UX only). This is
      // NOT the security boundary — v_learner_hostelites_scoped already restricts
      // block-scoped wardens to their granted blocks server-side from auth.uid().
      // A tampered/forged block_ids list cannot widen scope past the scoped view.
      if (filters?.block_ids && filters.block_ids.length > 0) {
        query = query.in('current_block_id', filters.block_ids);
      }

      if (filters?.hostel_category_id) query = query.eq('hostel_category_id', filters.hostel_category_id);
      if (filters?.mess_category_id) query = query.eq('mess_category_id', filters.mess_category_id);
      // Room filter matches the learner's CURRENT allocation room (view column).
      if (filters?.room_id) query = query.eq('current_room_id', filters.room_id);

      // Academic cascade filters (parity with Learners Profiles).
      if (filters?.degree_id) query = query.eq('degree_id', filters.degree_id);
      if (filters?.department_id) query = query.eq('department_id', filters.department_id);
      if (filters?.program_id) query = query.eq('program_id', filters.program_id);
      if (filters?.semester_id) query = query.eq('semester_id', filters.semester_id);
      if (filters?.section_id) query = query.eq('section_id', filters.section_id);
      if (filters?.academic_year_id) query = query.eq('academic_year_id', filters.academic_year_id);

      if (filters?.search) {
        const s = filters.search.trim();
        if (s) {
          query = query.or(
            `roll_number.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,student_email.ilike.%${s}%`,
          );
        }
      }

      const SORTABLE = new Set([
        'roll_number',
        'first_name',
        'last_name',
        'program_name',
        'current_block_name',
        'gender',
        'program_start_year',
      ]);
      const sortColumn = filters?.sortBy && SORTABLE.has(filters.sortBy)
        ? filters.sortBy
        : 'roll_number';
      const ascending = (filters?.sortOrder ?? 'asc') === 'asc';

      const from = (page - 1) * pageSize;
      query = query
        .order(sortColumn, { ascending })
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
  //
  // hostel-rooms-v2 PR 2 (2026-05-26): hostel_blocks.institution_id dropped;
  // blocks now relate to colleges N:M via hostel_block_institutions. The
  // returned shape gains institution_ids (string[]) replacing institution_id
  // (string) for the consumer reconciliation logic.
  static async listBlocksForFilter(
    institutionId?: string,
  ): Promise<Array<{ id: string; name: string; code: string; hostel_type: string | null; institution_ids: string[] }>> {
    try {
      const supabase = createClientSupabaseClient();

      // Narrow via junction when institutionId provided.
      let blockIdFilter: string[] | null = null;
      if (institutionId) {
        const { data: ids } = await supabase
          .from('hostel_block_institutions')
          .select('block_id')
          .eq('institution_id', institutionId);
        blockIdFilter = (ids ?? []).map((r) => r.block_id);
      }

      let query = supabase
        .from('hostel_blocks')
        .select('id,name,code,hostel_type')
        .order('name', { ascending: true });
      if (blockIdFilter !== null) {
        if (blockIdFilter.length === 0) return [];
        query = query.in('id', blockIdFilter);
      }
      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/learner-hostelite', 'listBlocksForFilter failed', error);
        throw error;
      }
      const blocks = data ?? [];
      if (blocks.length === 0) return [];

      // Pull junction rows for all returned blocks in one query.
      const { data: junction } = await supabase
        .from('hostel_block_institutions')
        .select('block_id,institution_id')
        .in('block_id', blocks.map((b) => b.id));
      const grantsByBlock = new Map<string, string[]>();
      for (const row of junction ?? []) {
        const existing = grantsByBlock.get(row.block_id) ?? [];
        existing.push(row.institution_id);
        grantsByBlock.set(row.block_id, existing);
      }

      return blocks.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        // 'boys' | 'girls' — same vocabulary as hostel/mess category `type`,
        // so a selected block directly scopes the category filter dropdowns.
        hostel_type: (b as { hostel_type?: string | null }).hostel_type ?? null,
        institution_ids: grantsByBlock.get(b.id) ?? [],
      }));
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in listBlocksForFilter', error);
      throw error;
    }
  }

  // ── Detail bundle (BUG-003326) ────────────────────────────────────────
  // Parallel-fetch for the read-only detail drawer triggered by row-click.
  // 7 independent queries fired via Promise.all:
  //   1. learner row from v_learner_hostelites (with year_of_study + alloc FKs)
  //   2. hostel profile (learner_hostel_profiles)
  //   3. current allocation + JOIN block/room/bed for display names
  //   4. last 5 gate-passes
  //   5. last 5 attendance entries
  //   6. open vacate request (any non-completed/cancelled status)
  //   7. last 5 hostel_leave_requests (2026-05-15 — slice added once
  //      /campus-living/leave UI route existed; was deferred in PR #822 per
  //      /assumption-thrash Round 1 #2).
  static async getLearnerDetailBundle(learnerId: string): Promise<LearnerDetailBundle> {
    try {
      const supabase = createClientSupabaseClient();

      // The hostel activity tables (allocations / gate-passes / attendance /
      // vacate / leaves) FK learner_id -> profiles.id, but this drawer is opened
      // with a learners_profiles.id (v_learner_hostelites.id). Resolve the bridge
      // once (profiles.learner_id is strictly 1:1). learner_hostel_profiles and
      // the bills RPC key on learners_profiles.id, so they keep `learnerId`.
      const { data: profRow } = await supabase
        .from('profiles')
        .select('id')
        .eq('learner_id', learnerId)
        .maybeSingle();
      const profileId = (profRow as { id: string } | null)?.id ?? null;

      // Resolved-empty fallbacks keep the Promise.all positional when a learner
      // has no login profile (profileId null) — avoids `.eq(col, null/undefined)`.
      const emptyMaybe = Promise.resolve({ data: null, error: null });
      const emptyList = Promise.resolve({ data: [], error: null });

      const [
        learnerRes,
        profileRes,
        allocRes,
        gpRes,
        attRes,
        vacRes,
        leaveRes,
        bills,
      ] = await Promise.all([
        (supabase as any)
          .from('v_learner_hostelites')
          .select(VIEW_SELECT)
          .eq('id', learnerId)
          .maybeSingle(),
        supabase
          .from('learner_hostel_profiles')
          .select('*')
          .eq('learner_id', learnerId)
          .maybeSingle(),
        // Active OR proposed (pending_approval) OR pending_vacate, so a freshly
        // allocated learner shows their room with a status instead of "Unallocated".
        profileId
          ? supabase
              .from('hostel_allocations')
              .select(
                'id, block_id, room_id, bed_id, allocation_date, expected_vacate_date, status, ' +
                  'block:hostel_blocks!block_id(name,code), ' +
                  'room:hostel_rooms!room_id(room_number), ' +
                  'bed:hostel_beds!bed_id(bed_number)',
              )
              .eq('learner_id', profileId)
              .in('status', ['active', 'pending_approval', 'pending_vacate'])
              .order('allocation_date', { ascending: false })
              .limit(1)
              .maybeSingle()
          : emptyMaybe,
        profileId
          ? supabase
              .from('hostel_gate_passes')
              .select('id, pass_number, status, out_time, in_time, purpose, created_at')
              .eq('learner_id', profileId)
              .order('created_at', { ascending: false })
              .limit(5)
          : emptyList,
        profileId
          ? supabase
              .from('hostel_attendance')
              .select('id, date, status, marked_at')
              .eq('learner_id', profileId)
              .order('date', { ascending: false })
              .limit(5)
          : emptyList,
        profileId
          ? supabase
              .from('hostel_vacate_requests')
              .select('id, status, reason, effective_date, created_at')
              .eq('learner_id', profileId)
              .not('status', 'in', '(completed,cancelled,rejected)')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : emptyMaybe,
        profileId
          ? supabase
              .from('hostel_leave_requests')
              .select('id, status, leave_type, reason, from_date, to_date, created_at')
              .eq('learner_id', profileId)
              .order('created_at', { ascending: false })
              .limit(5)
          : emptyList,
        // Itemized bills across all academic years (SECURITY DEFINER RPC —
        // campus-living operators usually lack billing.* SELECT). Non-fatal:
        // returns [] on error so the rest of the drawer still renders. Keyed on
        // learners_profiles.id (billing_student_bills.student_id).
        this.getBillsForStudent(learnerId),
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
      const recentLeaves = (leaveRes.data ?? []) as LearnerLeaveSummary[];

      return {
        learner,
        hostelProfile,
        currentAllocation,
        recentGatePasses,
        recentAttendance,
        openVacateRequest,
        recentLeaves,
        bills: bills ?? [],
      };
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'getLearnerDetailBundle failed', error);
      throw error;
    }
  }

  // ── Resolve the global accommodation_types id for a code ──
  // accommodation_type TEXT is retired; the hostel/day-scholar flip now writes
  // accommodation_type_id. The catalog is global (one row per code).
  private static async accommodationIdForCode(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    code: 'hostel' | 'dayscholar',
  ): Promise<string> {
    const { data: at, error: atErr } = await supabase
      .from('accommodation_types')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (atErr) throw atErr;
    if (!at?.id) {
      throw new Error(`No '${code}' accommodation type configured`);
    }
    return at.id;
  }

  // ── Remove from hostel ────────────────────────────────────────────────
  // Flips accommodation_type_id to the institution's 'dayscholar' row on the
  // underlying table (NOT the view). Caller is responsible for
  // cancelling/vacating any active allocation.
  static async removeFromHostel(learnerId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const accId = await this.accommodationIdForCode(supabase, 'dayscholar');
      const { error } = await supabase
        .from('learners_profiles')
        .update({ accommodation_type_id: accId })
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
  static async addToHostel(learnerId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const accId = await this.accommodationIdForCode(supabase, 'hostel');
      const { error } = await supabase
        .from('learners_profiles')
        .update({ accommodation_type_id: accId })
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

  // ── Available year_of_study values for dynamic Year chips ────────────
  // Returns sorted distinct year_of_study values currently present in
  // v_learner_hostelites (NULL excluded). Used by the Year filter to render
  // dynamic chips instead of hardcoded 1..4. Cohort drift (Year 5+, gap years)
  // surfaces automatically.
  static async listAvailableYears(institutionId?: string): Promise<number[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('v_learner_hostelites')
      .select('year_of_study')
      .not('year_of_study', 'is', null);
    if (institutionId) query = query.eq('institution_id', institutionId);
    const { data, error } = await query;
    if (error) {
      logger.error('campus-living/learner-hostelite', 'listAvailableYears failed', error);
      throw error;
    }
    const set = new Set<number>();
    (data ?? []).forEach((r: { year_of_study: number | null }) => {
      if (r.year_of_study !== null) set.add(r.year_of_study);
    });
    return Array.from(set).sort((a, b) => a - b);
  }

  // ── Current-year billing rollup for a page of hostelers ───────────────
  // Batched, non-fatal cross-module read. Calls the SECURITY DEFINER RPC
  // campus_living_get_hostelite_bill_status (scoped to accessible institutions)
  // so campus-living operators without billing.schedule.view can still see
  // per-student rollups. Returns a Map keyed by student_id (= learner id).
  static async getBillStatusForStudents(
    studentIds: string[],
  ): Promise<Map<string, HosteliteBillStatus>> {
    const map = new Map<string, HosteliteBillStatus>();
    if (!studentIds.length) return map;
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc(
        'campus_living_get_hostelite_bill_status',
        { p_student_ids: studentIds },
      );
      if (error) {
        logger.error(
          'campus-living/learner-hostelite',
          'getBillStatusForStudents failed',
          error,
        );
        return map; // non-fatal — table still lists residents without billing cols
      }
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        map.set(String(row.student_id), {
          bill_count: Number(row.bill_count ?? 0),
          total_billed: Number(row.total_billed ?? 0),
          total_paid: Number(row.total_paid ?? 0),
          total_outstanding: Number(row.total_outstanding ?? 0),
          payment_status:
            (row.payment_status as HosteliteBillStatus['payment_status']) ?? 'none',
          academic_year_name: (row.academic_year_name as string | null) ?? null,
        });
      }
    } catch (err) {
      logger.error(
        'campus-living/learner-hostelite',
        'getBillStatusForStudents unexpected',
        err,
      );
    }
    return map;
  }

  // ── Itemized bills for one hostelite (detail drawer) ──────────────────
  // Each row of billing_student_bills is a line item (category + amount +
  // balance + status). Calls the SECURITY DEFINER RPC
  // campus_living_get_hostelite_bills (gated on campus_living.residents.view,
  // scoped to accessible institutions) so wardens without billing.* SELECT can
  // still see the breakdown — a direct read would silently return 0 rows under
  // billing_student_bills RLS. ALL academic years; non-fatal (returns []).
  static async getBillsForStudent(studentId: string): Promise<LearnerBillItem[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc(
        'campus_living_get_hostelite_bills',
        { p_student_id: studentId },
      );
      if (error) {
        logger.error('campus-living/learner-hostelite', 'getBillsForStudent failed', error);
        return [];
      }
      return (data ?? []) as LearnerBillItem[];
    } catch (err) {
      logger.error('campus-living/learner-hostelite', 'getBillsForStudent unexpected', err);
      return [];
    }
  }

  // ── Unallocated hostelites with block-independent readiness check ────────
  // Calls fn_hostel_unallocated_candidates (SECURITY DEFINER, STABLE). Returns
  // every active hostelite who does NOT have an active/pending-approval bed,
  // annotated with readiness flags and a human-readable missing_items list so
  // the admin can see at a glance why each student isn't placed yet.
  // ~231 rows today; loaded in full and filtered client-side.
  static async listUnallocated(institutionId?: string): Promise<UnallocatedCandidate[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc(
        'fn_hostel_unallocated_candidates',
        { p_institution_id: institutionId ?? null },
      );
      if (error) {
        logger.error('campus-living/learner-hostelite', 'listUnallocated failed', error);
        throw error;
      }
      return (data ?? []) as UnallocatedCandidate[];
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'listUnallocated unexpected', error);
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

      // Existing hostelers are excluded by FK now (accommodation_type TEXT
      // retired). Gather the global 'hostel' accommodation_type ids to
      // exclude; null-FK learners (blank accommodation) stay valid candidates.
      const hostelQuery = supabase
        .from('accommodation_types')
        .select('id')
        .eq('code', 'hostel');
      const { data: hostelRows, error: hostelErr } = await hostelQuery;
      if (hostelErr) {
        logger.error('campus-living/learner-hostelite', 'searchCandidates hostel-id lookup failed', hostelErr);
        throw hostelErr;
      }
      const hostelIds = (hostelRows ?? []).map((r: { id: string }) => r.id);

      let query = supabase
        .from('learners_profiles')
        .select(LEARNER_TABLE_SELECT)
        .or(
          `roll_number.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,student_email.ilike.%${s}%`,
        )
        .limit(limit);
      if (hostelIds.length > 0) {
        query = query.or(
          `accommodation_type_id.is.null,accommodation_type_id.not.in.(${hostelIds.join(',')})`,
        );
      }
      if (institutionId) query = query.eq('institution_id', institutionId);
      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/learner-hostelite', 'searchCandidates failed', error);
        throw error;
      }
      // Flatten accommodation_type from the embed (legacy 'HOSTEL'/'DAY SCHOLAR').
      return (data ?? []).map((row: Record<string, unknown>) => {
        const ref = row.accommodation_ref as { code?: string } | null;
        delete row.accommodation_ref;
        row.accommodation_type = accommodationLegacyFromCode(ref?.code);
        return row;
      }) as unknown as LearnerHostelite[];
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in searchCandidates', error);
      throw error;
    }
  }
}
