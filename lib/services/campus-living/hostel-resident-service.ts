import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelResident,
  HostelResidentWithProfile,
  CreateHostelResidentDTO,
  UpdateHostelResidentDTO,
  ResidentFilters,
} from '@/types/hostel-residents';

export class HostelResidentService {
  // ── List residents with filters ───────────────────────────────────
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

      // Guard: empty/undefined institutionId means super_admin view (no filter).
      // Without this guard, Postgres rejects .eq('institution_id', '') with
      // "invalid input syntax for type uuid". Caught on prod 2026-04-23.
      if (institutionId) query = query.eq('institution_id', institutionId);

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
        .single();

      if (error) {
        logger.error('campus-living/residents', 'Failed to fetch resident', error);
        throw error;
      }
      return data as HostelResidentWithProfile;
    } catch (error) {
      logger.error('campus-living/residents', 'Unexpected error in getResident', error);
      throw error;
    }
  }

  // ── Find resident by profile within institution ──────────────────
  // Used by allocation flow: "does this person already have a resident record here?"
  static async findByProfile(institutionId: string | undefined, profileId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_residents')
        .select('*')
        .eq('institution_id', institutionId)
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
      const existing = await this.findByProfile(payload.institution_id, payload.profile_id);
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
