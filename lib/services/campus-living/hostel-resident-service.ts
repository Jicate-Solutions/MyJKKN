// hostel-rooms-v2 PR 2 (2026-05-26): institution_id dropped from hostel_residents.
// Residents are administrative entities; college affiliation flows through
// their active hostel_allocations row.
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelResident,
  HostelResidentWithProfile,
  HostelResidentWithInstitutions,
  CreateHostelResidentDTO,
  UpdateHostelResidentDTO,
  ResidentFilters,
} from '@/types/hostel-residents';

export class HostelResidentService {
  // ── List residents with filters ───────────────────────────────────
  // institutionId parameter retained for API stability (callers still pass
  // it); when provided, narrows via JOIN through hostel_allocations →
  // hostel_block_institutions. Residents without any allocation are excluded
  // from the institution-scoped result, included when institutionId is empty
  // (super_admin view).
  static async getResidents(
    institutionId: string | undefined,
    filters?: ResidentFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_residents')
        .select(
          '*, profile:profiles!hostel_residents_profile_id_fkey(id, full_name, email)',
          { count: 'exact' }
        );

      if (institutionId) {
        // Filter through allocation → block junction.
        const { data: blockIds } = await supabase
          .from('hostel_block_institutions')
          .select('block_id')
          .eq('institution_id', institutionId);
        const blockIdList = (blockIds ?? []).map((r) => r.block_id);

        if (blockIdList.length === 0) {
          return { data: [] as HostelResidentWithProfile[], count: 0 };
        }

        const { data: allocations } = await supabase
          .from('hostel_allocations')
          .select('resident_id')
          .in('block_id', blockIdList)
          .not('resident_id', 'is', null);
        const residentIds = Array.from(
          new Set(
            (allocations ?? [])
              .map((r) => r.resident_id)
              .filter((v): v is string => Boolean(v)),
          ),
        );

        if (residentIds.length === 0) {
          return { data: [] as HostelResidentWithProfile[], count: 0 };
        }
        query = query.in('id', residentIds);
      }

      if (filters?.resident_type) query = query.eq('resident_type', filters.resident_type);
      if (typeof filters?.is_active === 'boolean') query = query.eq('is_active', filters.is_active);
      if (filters?.search) {
        const term = `%${filters.search}%`;
        query = query.or(
          `id_proof_number.ilike.${term},notes.ilike.${term}`
        );
      }

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/residents', 'Failed to fetch residents', error);
        throw error;
      }
      return { data: (data ?? []) as HostelResidentWithProfile[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/residents', 'Unexpected error in getResidents', error);
      throw error;
    }
  }

  // ── List residents enriched with derived institution_ids (PR 3) ───
  // Joins each resident with their active hostel_allocations → block →
  // hostel_block_institutions to surface the "which college(s) does this
  // resident belong to?" admin-UI column that PR 2 deleted along with the
  // dropped hostel_residents.institution_id column.
  //
  // Empty derived_institution_ids = no active allocation; UI renders the
  // "Not allocated" badge.
  static async getResidentsWithInstitutions(
    institutionId: string | undefined,
    filters?: ResidentFilters,
    page = 1,
    pageSize = 50
  ) {
    const result = await this.getResidents(institutionId, filters, page, pageSize);
    if (result.data.length === 0) {
      return { data: [] as HostelResidentWithInstitutions[], count: result.count };
    }

    const supabase = createClientSupabaseClient();

    // 1. Fetch active allocations for these residents.
    const residentIds = result.data.map((r) => r.id);
    const { data: allocations, error: allocError } = await supabase
      .from('hostel_allocations')
      .select('resident_id, block_id')
      .in('resident_id', residentIds)
      .is('check_out_date', null);

    if (allocError) {
      logger.warn(
        'campus-living/residents',
        'Failed to enrich residents with institutions (allocation lookup); falling back to empty derived list',
        allocError,
      );
      return {
        data: result.data.map((r) => ({ ...r, derived_institution_ids: [] })) as HostelResidentWithInstitutions[],
        count: result.count,
      };
    }

    const blockIdSet = Array.from(
      new Set(((allocations ?? []) as Array<{ resident_id: string | null; block_id: string }>)
        .map((a) => a.block_id)
        .filter(Boolean)),
    );

    // 2. Map block → institution_ids via hostel_block_institutions.
    const blockInstMap = new Map<string, string[]>();
    if (blockIdSet.length > 0) {
      const { data: junction } = await supabase
        .from('hostel_block_institutions')
        .select('block_id, institution_id')
        .in('block_id', blockIdSet);
      for (const row of junction ?? []) {
        const list = blockInstMap.get(row.block_id) ?? [];
        list.push(row.institution_id);
        blockInstMap.set(row.block_id, list);
      }
    }

    // 3. Map resident → unique institution_ids (across all active allocations).
    const residentInstMap = new Map<string, Set<string>>();
    for (const a of (allocations ?? []) as Array<{ resident_id: string | null; block_id: string }>) {
      if (!a.resident_id) continue;
      const insts = blockInstMap.get(a.block_id) ?? [];
      const existing = residentInstMap.get(a.resident_id) ?? new Set<string>();
      for (const i of insts) existing.add(i);
      residentInstMap.set(a.resident_id, existing);
    }

    return {
      data: result.data.map((r) => ({
        ...r,
        derived_institution_ids: Array.from(residentInstMap.get(r.id) ?? []),
      })) as HostelResidentWithInstitutions[],
      count: result.count,
    };
  }

  // ── Single resident ───────────────────────────────────────────────
  static async getResident(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_residents')
        .select(
          '*, profile:profiles!hostel_residents_profile_id_fkey(id, full_name, email)'
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/residents', 'Failed to fetch resident', error);
        throw error;
      }
      return data as HostelResidentWithProfile | null;
    } catch (error) {
      logger.error('campus-living/residents', 'Unexpected error in getResident', error);
      throw error;
    }
  }

  // ── Find resident by profile ────────────────────────────────────
  // hostel-rooms-v2 PR 2 (2026-05-26): institution_id dropped from
  // hostel_residents (UNIQUE constraint is now on profile_id alone).
  // A person has at most one resident record network-wide.
  // The first arg (formerly institutionId) is kept positional for callsite
  // stability but is ignored.
  static async findByProfile(_institutionId: string | undefined, profileId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_residents')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/residents', 'Failed to find resident by profile', error);
        throw error;
      }
      return data as HostelResident | null;
    } catch (error) {
      logger.error('campus-living/residents', 'Unexpected error in findByProfile', error);
      throw error;
    }
  }

  // ── Upsert: find existing or create new ──────────────────────────
  // Allocation flow calls this before creating an allocation to guarantee a resident row.
  static async upsertResident(payload: CreateHostelResidentDTO) {
    try {
      const existing = await this.findByProfile(undefined, payload.profile_id);
      if (existing) return existing;

      return await this.createResident(payload);
    } catch (error) {
      logger.error('campus-living/residents', 'Unexpected error in upsertResident', error);
      throw error;
    }
  }

  // ── Create resident ───────────────────────────────────────────────
  static async createResident(payload: CreateHostelResidentDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_residents')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/residents', 'Failed to create resident', error);
        throw error;
      }
      return data as HostelResident;
    } catch (error) {
      logger.error('campus-living/residents', 'Unexpected error in createResident', error);
      throw error;
    }
  }

  // ── Update resident ───────────────────────────────────────────────
  static async updateResident(id: string, payload: UpdateHostelResidentDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_residents')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/residents', 'Failed to update resident', error);
        throw error;
      }
      return data as HostelResident;
    } catch (error) {
      logger.error('campus-living/residents', 'Unexpected error in updateResident', error);
      throw error;
    }
  }

  // ── Delete resident (soft: mark inactive) ────────────────────────
  // Hard delete is blocked by RESTRICT FK from hostel_allocations.
  // Wardens should deactivate, not delete, residents with allocation history.
  static async deactivateResident(id: string) {
    return await this.updateResident(id, { is_active: false });
  }

  // ── Hard delete (admin only; fails if has allocations) ──────────
  static async deleteResident(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase.from('hostel_residents').delete().eq('id', id);
      if (error) {
        logger.error('campus-living/residents', 'Failed to delete resident', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/residents', 'Unexpected error in deleteResident', error);
      throw error;
    }
  }

  // ── Bulk delete ───────────────────────────────────────────────────
  // Per-ID isolation so one FK-restricted failure doesn't abort the whole batch.
  static async bulkDeleteResidents(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteResident(id);
        success.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { success, failed };
  }
}
