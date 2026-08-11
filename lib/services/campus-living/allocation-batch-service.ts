import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  AllocationBatch,
  AllocationBatchRow,
  AllocatePreview,
  BatchCategoryBreakdown,
  ProposedAllocation,
  AutoCategoryOption,
  AcademicYearOption,
  AllocationCandidate,
  AllocationEligibilityExplain,
} from '@/types/allocation-batch';

const LOG = 'campus-living/allocation-batch';

export class AllocationBatchService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // The generated Database type doesn't carry these campus-living RPCs; wrap
  // .rpc() loosely (each caller validates/casts the result).
  private static rpcCall(fn: string, args: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.supabase as any).rpc(fn, args) as Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  }

  // PostgrestError extends Error, so JSON.stringify(err) is "{}" — logging the
  // raw object hid a 57014 statement timeout behind an empty payload and cost a
  // whole debugging session. Always log this shape, never the bare error.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static rpcErr(error: any) {
    return {
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      details: error?.details ?? null,
      hint: error?.hint ?? null,
    };
  }

  // ── Auto-allocation engine RPCs ──
  // Scoped by hostel TYPE ('boys' | 'girls'), never by block or floor: the
  // physical-room rules already decide which block/room a cohort may enter, so
  // the engine sweeps every block of the type. institutionId / programId /
  // semesterId narrow WHICH learners are considered (null = no filter).
  static async preview(
    hostelType: string,
    institutionId: string | null = null,
    programId: string | null = null,
    semesterId: string | null = null,
  ): Promise<AllocatePreview> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_preview', {
      p_hostel_type: hostelType,
      p_institution_id: institutionId, p_program_id: programId, p_semester_id: semesterId,
    });
    if (error) { logger.error(LOG, 'preview failed', this.rpcErr(error)); throw new Error(error.message || 'Failed to preview allocation'); }
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? { cohort_eligible: 0, no_profile: 0, already_allocated: 0, available_beds: 0, rules_set: false }) as AllocatePreview;
  }

  // strict=true → only learners whose cohort matches a physical-room rule are eligible
  // (open/rule-free rooms are NOT used as a catch-all). Physical rule first, then category.
  //
  // allowOverflow=true → when every room RESERVED for the learner's cohort in
  // their eligible category is full, fall back to rooms of that SAME category
  // that no rule reserves. Category is never changed and no other cohort's
  // reserved room is ever used. Pass false to reproduce the pre-2026-08-10
  // behaviour exactly — useful for proving a run changed nothing else.
  static async previewCandidates(
    hostelType: string,
    strict = true,
    institutionId: string | null = null,
    programId: string | null = null,
    semesterId: string | null = null,
    allowOverflow = true,
  ): Promise<AllocationCandidate[]> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_candidates', {
      p_hostel_type: hostelType, p_strict: strict,
      p_institution_id: institutionId, p_program_id: programId, p_semester_id: semesterId,
      p_allow_overflow: allowOverflow,
    });
    if (error) { logger.error(LOG, 'previewCandidates failed', this.rpcErr(error)); throw new Error(error.message || 'Failed to preview candidates'); }
    return (Array.isArray(data) ? data : []) as AllocationCandidate[];
  }

  // Produces ONE batch spanning every block of the type. The hostel year is
  // omitted on purpose — the RPC defaults to hostel_years.is_current.
  // allowOverflow must match whatever the operator previewed with, or Generate
  // places a different set than the preview showed.
  static async generate(
    hostelType: string,
    strict = true,
    institutionId: string | null = null,
    programId: string | null = null,
    semesterId: string | null = null,
    allowOverflow = true,
  ): Promise<string> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_classic', {
      p_hostel_type: hostelType, p_strict: strict,
      p_institution_id: institutionId, p_program_id: programId, p_semester_id: semesterId,
      p_allow_overflow: allowOverflow,
    });
    if (error) { logger.error(LOG, 'generate failed', this.rpcErr(error)); throw new Error(error.message || 'Failed to generate allocation batch'); }
    return data as string;
  }

  // Institutions housed by ANY block of this hostel type — scopes the
  // Institution cohort filter to what the engine can actually place.
  static async getInstitutionsByHostelType(hostelType: string): Promise<{ id: string; name: string }[]> {
    if (!hostelType) return [];
    const { data, error } = await this.supabase
      .from('hostel_block_institutions')
      .select('institution_id, institutions(name), hostel_blocks!inner(hostel_type)')
      .eq('hostel_blocks.hostel_type', hostelType);
    if (error) { logger.error(LOG, 'getInstitutionsByHostelType failed', this.rpcErr(error)); throw new Error(error.message || 'Failed to load institutions'); }
    // A college can be served by several blocks of the same type — dedupe by id.
    const byId = new Map<string, { id: string; name: string }>();
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const id = r.institution_id as string;
      if (id && !byId.has(id)) {
        byId.set(id, { id, name: (r.institutions as { name?: string } | null)?.name ?? '—' });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  static async approve(batchId: string): Promise<void> {
    const { error } = await this.rpcCall('fn_approve_allocation_batch', {
      p_batch_id: batchId,
    });
    if (error) {
      logger.error(LOG, 'approve failed', error);
      throw new Error(error.message || 'Failed to approve batch');
    }
  }

  static async reject(batchId: string): Promise<void> {
    const { error } = await this.rpcCall('fn_reject_allocation_batch', {
      p_batch_id: batchId,
    });
    if (error) {
      logger.error(LOG, 'reject failed', error);
      throw new Error(error.message || 'Failed to reject batch');
    }
  }

  // Completely remove a batch (frees beds + deletes its allocations + the batch).
  static async reset(batchId: string): Promise<void> {
    const { error } = await this.rpcCall('fn_reset_allocation_batch', {
      p_batch_id: batchId,
    });
    if (error) {
      logger.error(LOG, 'reset failed', error);
      throw new Error(error.message || 'Failed to reset batch');
    }
  }

  // Remove a chosen subset of a batch's allocations (frees their beds, deletes
  // just those rows, keeps the rest of the batch intact) — as opposed to
  // reset(), which discards the whole batch.
  static async removeAllocations(batchId: string, allocationIds: string[]): Promise<void> {
    const { error } = await this.rpcCall('fn_remove_batch_allocations', {
      p_batch_id: batchId,
      p_allocation_ids: allocationIds,
    });
    if (error) {
      logger.error(LOG, 'removeAllocations failed', error);
      throw new Error(error.message || 'Failed to remove selected allocations');
    }
  }

  // ── Reads ──
  static async getBatches(institutionId?: string): Promise<AllocationBatchRow[]> {
    let q = this.supabase
      .from('hostel_allocation_batches')
      .select('*, category:hostel_categories(name), institution:institutions(name), block:hostel_blocks(name)')
      .order('created_at', { ascending: false });
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q;
    if (error) {
      logger.error(LOG, 'getBatches failed', error);
      throw new Error(error.message || 'Failed to load batches');
    }

    // Per-room-category rooms/beds across all listed batches in one RPC; a batch
    // spans multiple room categories, so batches.category_id is not representative.
    const breakdowns = new Map<string, BatchCategoryBreakdown[]>();
    const batchIds = (data ?? []).map((r: Record<string, unknown>) => r.id as string);
    if (batchIds.length > 0) {
      const { data: bd, error: bdErr } = await this.rpcCall('fn_batch_room_category_breakdown', {
        p_batch_ids: batchIds,
      });
      if (bdErr) {
        logger.error(LOG, 'getBatches breakdown failed', bdErr);
      } else {
        ((bd ?? []) as { batch_id: string; category: string; floors: string | null; rooms: number; beds: number }[]).forEach(
          (row) => {
            const list = breakdowns.get(row.batch_id) ?? [];
            list.push({ category: row.category, floors: row.floors, rooms: row.rooms, beds: row.beds });
            breakdowns.set(row.batch_id, list);
          }
        );
      }
    }

    return (data ?? []).map((r: Record<string, unknown>) => {
      const cat = r.category as { name?: string } | null;
      const inst = r.institution as { name?: string } | null;
      const blk = r.block as { name?: string } | null;
      const { category: _c, institution: _i, block: _b, ...rest } = r;
      return {
        ...(rest as AllocationBatch),
        category_name: cat?.name ?? null,
        institution_name: inst?.name ?? null,
        block_name: blk?.name ?? null,
        category_breakdown: breakdowns.get(r.id as string) ?? [],
      };
    });
  }

  static async getBatch(
    batchId: string
  ): Promise<{ batch: AllocationBatchRow | null; allocations: ProposedAllocation[] }> {
    const { data: b, error: bErr } = await this.supabase
      .from('hostel_allocation_batches')
      .select('*, category:hostel_categories(name), institution:institutions(name), block:hostel_blocks(name, total_capacity, current_occupancy)')
      .eq('id', batchId)
      .maybeSingle();
    if (bErr) {
      logger.error(LOG, 'getBatch failed', bErr);
      throw new Error(bErr.message || 'Failed to load batch');
    }
    let batch: AllocationBatchRow | null = null;
    if (b) {
      const r = b as Record<string, unknown>;
      const cat = r.category as { name?: string } | null;
      const inst = r.institution as { name?: string } | null;
      const blk = r.block as { name?: string; total_capacity?: number; current_occupancy?: number } | null;
      const { category: _c, institution: _i, block: _b, ...rest } = r;
      batch = {
        ...(rest as AllocationBatch),
        category_name: cat?.name ?? null,
        institution_name: inst?.name ?? null,
        block_name: blk?.name ?? null,
        block_total_capacity: blk?.total_capacity ?? null,
        block_current_occupancy: blk?.current_occupancy ?? null,
      };
    }

    const { data: allocs, error: aErr } = await this.supabase
      .from('hostel_allocations')
      .select(
        // Institution + program come off the learner's profile. profiles has
        // TWO FKs to institutions, so the constraint must be named explicitly;
        // program is profiles.learner_id -> learners_profiles.program_id -> programs.
        `id, status, learner_id, created_at,
         block:hostel_blocks(name),
         room:hostel_rooms(room_number, floor, category:hostel_categories(name)),
         bed:hostel_beds(bed_number),
         learner:profiles!hostel_allocations_learner_id_fkey(
           full_name, email,
           institution:institutions!profiles_institution_id_fkey(name),
           learner_profile:learners_profiles!profiles_learner_id_fkey(
             semester_id,
             program:programs!fk_learners_profiles_program(program_name)
           )
         )`
      )
      .eq('batch_id', batchId);
    if (aErr) {
      logger.error(LOG, 'getBatch allocations failed', aErr);
      throw new Error(aErr.message || 'Failed to load batch allocations');
    }

    const rawRows = (allocs ?? []).map((a: Record<string, unknown>) => {
      const block = a.block as { name?: string } | null;
      const room = a.room as {
        room_number?: string;
        floor?: number;
        category?: { name?: string } | null;
      } | null;
      const bed = a.bed as { bed_number?: string } | null;
      const learner = a.learner as {
        full_name?: string;
        email?: string;
        institution?: { name?: string } | null;
        learner_profile?: {
          semester_id?: string | null;
          program?: { program_name?: string } | null;
        } | null;
      } | null;
      return {
        id: a.id as string,
        learner_id: (a.learner_id as string) ?? '',
        created_at: (a.created_at as string) ?? '',
        learner_name: learner?.full_name || learner?.email || '—',
        learner_institution: learner?.institution?.name ?? null,
        learner_program: learner?.learner_profile?.program?.program_name ?? null,
        semester_id: learner?.learner_profile?.semester_id ?? null,
        block_name: block?.name ?? null,
        room_number: room?.room_number ?? null,
        room_floor: room?.floor ?? null,
        room_category: room?.category?.name ?? null,
        bed_number: bed?.bed_number ?? null,
        status: a.status as string,
      };
    });

    // A room upgrade vacates the original batch allocation and adds a new active
    // one (which carries batch_id forward), so a learner can have two rows here.
    // Keep the live (non-vacated/cancelled) one — the upgraded room — falling back
    // to the latest otherwise, so the batch reflects the learner's current room.
    const isLive = (s: string) => s !== 'vacated' && s !== 'cancelled';
    const byLearner = new Map<string, (typeof rawRows)[number]>();
    for (const r of rawRows) {
      const key = r.learner_id || r.id;
      const prev = byLearner.get(key);
      if (!prev) { byLearner.set(key, r); continue; }
      const rLive = isLive(r.status), prevLive = isLive(prev.status);
      if (rLive !== prevLive) { if (rLive) byLearner.set(key, r); }
      else if ((r.created_at ?? '') > (prev.created_at ?? '')) byLearner.set(key, r);
    }
    const dedupedRows = [...byLearner.values()];

    // learners_profiles.semester_id has no embeddable named FK, so resolve names
    // in one lightweight follow-up query keyed by the distinct semester ids.
    const semesterIds = [...new Set(dedupedRows.map((r) => r.semester_id).filter(Boolean))] as string[];
    const semesterNames = new Map<string, string>();
    if (semesterIds.length > 0) {
      const { data: sems } = await this.supabase
        .from('semesters')
        .select('id, semester_name')
        .in('id', semesterIds);
      (sems ?? []).forEach((s: Record<string, unknown>) =>
        semesterNames.set(s.id as string, s.semester_name as string)
      );
    }

    // Mess category is not stored on allocations — resolved per learner by the
    // fee-aware eligibility functions; one RPC covers the whole batch.
    const messCategories = new Map<string, string>();
    const { data: mess, error: mErr } = await this.rpcCall('fn_batch_mess_categories', {
      p_batch_id: batchId,
    });
    if (mErr) {
      logger.error(LOG, 'getBatch mess categories failed', mErr);
    } else {
      ((mess ?? []) as { allocation_id: string; mess_category: string | null }[]).forEach((m) => {
        if (m.mess_category) messCategories.set(m.allocation_id, m.mess_category);
      });
    }

    const allocations: ProposedAllocation[] = dedupedRows
      .map(({ semester_id, learner_id: _lid, created_at: _ca, ...r }) => ({
        ...r,
        learner_semester: semester_id ? semesterNames.get(semester_id) ?? null : null,
        mess_category: messCategories.get(r.id) ?? null,
      }))
      .sort((x, y) => x.learner_name.localeCompare(y.learner_name));

    return { batch, allocations };
  }

  // Per-allocation eligibility explanation (why this resident → this room).
  static async explainAllocation(allocationId: string): Promise<AllocationEligibilityExplain> {
    const { data, error } = await this.rpcCall('fn_explain_allocation', { p_allocation_id: allocationId });
    if (error) {
      logger.error(LOG, 'explainAllocation failed', error);
      throw new Error(error.message || 'Failed to explain allocation');
    }
    return data as AllocationEligibilityExplain;
  }

  // ── Loaders ──
  static async getAutoCategories(): Promise<AutoCategoryOption[]> {
    const { data, error } = await this.supabase
      .from('hostel_categories')
      .select('id, name, type')
      .eq('allocation_mode', 'auto')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('type', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load auto categories');
    return (data ?? []) as AutoCategoryOption[];
  }

  // Blocks to fill (the auto-allocate target). Gender comes from hostel_type.
  static async getBlocks(): Promise<{ id: string; name: string; type: string }[]> {
    const { data, error } = await this.supabase
      .from('hostel_blocks')
      .select('id, name, hostel_type')
      .order('name', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load blocks');
    return (data ?? []).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      name: b.name as string,
      type: b.hostel_type as string,
    }));
  }

  // Hostel years are global (no institution_id) — the campus-living calendar.
  static async getHostelYears(): Promise<AcademicYearOption[]> {
    const { data, error } = await this.supabase
      .from('hostel_years')
      .select('id, name, is_current')
      .eq('is_active', true)
      .order('start_date', { ascending: false });
    if (error) throw new Error(error.message || 'Failed to load hostel years');
    return (data ?? []).map((y: Record<string, unknown>) => ({
      id: y.id as string,
      label: (y.name as string) + (y.is_current ? ' (current)' : ''),
    }));
  }
}
