import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  ProgramEligibility,
  ProgramEligibilityRow,
  CreateProgramEligibilityDto,
  UpdateProgramEligibilityDto,
  CategorySyncPreviewRow,
} from '@/types/program-eligibility';

const LOG = 'campus-living/program-eligibility';

// Lightweight option shapes for the override-picker dropdowns.
export interface ProgramOption {
  id: string;
  program_name: string;
}
export interface CategoryOption {
  id: string;
  name: string;
  type: string | null; // 'boys' | 'girls' — disambiguates same-named gender variants
}
export interface QuotaOption {
  id: string;
  code: string;
  name: string;
}
export interface InstitutionOption {
  id: string;
  name: string;
}

export class ProgramEligibilityService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // ─── Combined eligibility CRUD (single table: room + mess per band) ───────
  static async getEligibility(institutionId?: string): Promise<ProgramEligibilityRow[]> {
    const sb = this.supabase as any;
    let query = sb
      .from('hostel_program_eligibility')
      .select(
        '*, institution:institutions(name), program:programs(program_name), room_category:hostel_categories(name), mess_category:mess_categories(name)'
      )
      .order('institution_id', { ascending: true })
      .order('program_id', { ascending: true, nullsFirst: true })
      .order('fee_min', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });
    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data, error } = await query;
    if (error) {
      logger.error(LOG, 'Database error listing eligibility', error);
      throw new Error(error.message || 'Failed to fetch eligibility');
    }
    const rows = (data ?? []) as Record<string, unknown>[];

    // quota_ids is a uuid[] with no FK, so PostgREST can't embed quota names —
    // resolve them in one extra lookup. Names stay aligned 1:1 with quota_ids.
    const quotaIdSet = new Set<string>();
    for (const r of rows)
      for (const id of ((r.quota_ids as string[] | null) ?? [])) quotaIdSet.add(id);
    const quotaNameById = new Map<string, string>();
    if (quotaIdSet.size > 0) {
      const { data: qrows, error: qerr } = await sb
        .from('quotas')
        .select('id, name')
        .in('id', Array.from(quotaIdSet));
      if (qerr) {
        logger.error(LOG, 'Database error resolving quota names', qerr);
        throw new Error(qerr.message || 'Failed to resolve quota names');
      }
      for (const q of (qrows ?? []) as { id: string; name: string }[])
        quotaNameById.set(q.id, q.name);
    }

    return rows.map((r) => {
      const institution = r.institution as { name?: string } | null;
      const program = r.program as { program_name?: string } | null;
      const room = r.room_category as { name?: string } | null;
      const mess = r.mess_category as { name?: string } | null;
      const { institution: _i, program: _p, room_category: _rc, mess_category: _mc, ...rest } = r;
      const quotaIds = (rest as ProgramEligibility).quota_ids ?? [];
      return {
        // `...rest` carries the stored `hostel_type` + `quota_ids` columns.
        ...(rest as ProgramEligibility),
        institution_name: institution?.name ?? null,
        program_name: program?.program_name ?? null,
        quota_names: quotaIds.map((id) => quotaNameById.get(id) ?? id),
        room_category_name: room?.name ?? null,
        mess_category_name: mess?.name ?? null,
      };
    });
  }

  static async createEligibility(dto: CreateProgramEligibilityDto): Promise<ProgramEligibility> {
    const sb = this.supabase as any;
    const { data, error } = await sb
      .from('hostel_program_eligibility')
      .insert([{
        institution_id: dto.institution_id,
        program_id: dto.program_id ?? null,
        quota_ids: dto.quota_ids && dto.quota_ids.length ? dto.quota_ids : null,
        fee_min: dto.fee_min ?? null,
        fee_max: dto.fee_max ?? null,
        room_category_id: dto.room_category_id || null,
        mess_category_id: dto.mess_category_id || null,
        hostel_type: dto.hostel_type ?? 'both',
        is_monthly_mess_allowed: dto.is_monthly_mess_allowed ?? false,
        is_active: dto.is_active ?? true,
        effective_from: dto.effective_from ?? null,
      }])
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'Database error creating eligibility', error);
      throw new Error(
        error.code === '23505'
          ? 'A rule already exists for this institution / program / quota / fee band / gender.'
          : error.message || 'Failed to create eligibility'
      );
    }
    return data as ProgramEligibility;
  }

  static async updateEligibility(id: string, dto: UpdateProgramEligibilityDto): Promise<ProgramEligibility> {
    const sb = this.supabase as any;
    const { data, error } = await sb
      .from('hostel_program_eligibility')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'Database error updating eligibility', error);
      throw new Error(
        error.code === '23505'
          ? 'A rule already exists for this institution / program / quota / fee band / gender.'
          : error.message || 'Failed to update eligibility'
      );
    }
    return data as ProgramEligibility;
  }

  static async deleteEligibility(id: string): Promise<void> {
    const sb = this.supabase as any;
    const { error } = await sb.from('hostel_program_eligibility').delete().eq('id', id);
    if (error) {
      logger.error(LOG, 'Database error deleting eligibility', error);
      throw new Error(error.message || 'Failed to delete eligibility');
    }
  }

  // ─── Write-back: apply fee-condition categories to learner profiles ──────
  // Resolves each "existing bill student" (active hosteler with an academic
  // bill) through the fee bands and writes the derived room + mess category
  // onto learners_profiles. Allocation wins for room; overwrite-never-wipe.
  // The bulk RPC self-gates on campus_living.settings.edit.
  static async syncLearnerCategories(
    institutionId?: string
  ): Promise<{ scanned: number; updated: number }> {
    const { data, error } = await (this.supabase.rpc as any)(
      'fn_apply_hostel_fee_categories_bulk',
      { p_institution: institutionId ?? null }
    );
    if (error) {
      logger.error(LOG, 'Database error syncing learner categories', error);
      throw new Error(error.message || 'Failed to sync learner categories');
    }
    const result = (data ?? {}) as { scanned?: number; updated?: number };
    return { scanned: result.scanned ?? 0, updated: result.updated ?? 0 };
  }

  // Dry-run of the sync above: per active hostel learner, the matched condition
  // and the proposed room/mess categories — nothing is written. Also lists the
  // no-academic-bill learners the sync skips, so operators see the full picture.
  static async previewLearnerCategorySync(
    institutionId?: string
  ): Promise<CategorySyncPreviewRow[]> {
    const { data, error } = await (this.supabase.rpc as any)(
      'fn_preview_hostel_fee_categories',
      { p_institution: institutionId ?? null }
    );
    if (error) {
      logger.error(LOG, 'Database error previewing learner category sync', error);
      throw new Error(error.message || 'Failed to preview learner category sync');
    }
    return (data ?? []) as CategorySyncPreviewRow[];
  }

  // ─── Effective resolution helper (fee-aware, learner-based) ──────────────
  // Fee-aware effective categories for a learner — program → quota → fee band.
  // The whole decision lives in the composite SQL function; [] => fail open.
  static async getEffectiveRoomCategories(learnerId: string): Promise<string[]> {
    // RPC not in generated Database types (existing loosely-typed RPC pattern).
    const { data, error } = await (this.supabase.rpc as any)(
      'fn_hostel_learner_room_categories',
      { p_learner_id: learnerId }
    );
    if (error) {
      logger.error(LOG, 'Database error resolving effective room categories', error);
      throw new Error(error.message || 'Failed to resolve room categories');
    }
    return ((data ?? []) as Array<{ category_id: string }>).map((r) => r.category_id);
  }

  static async getEffectiveMessCategories(learnerId: string): Promise<string[]> {
    const { data, error } = await (this.supabase.rpc as any)(
      'fn_hostel_learner_mess_categories',
      { p_learner_id: learnerId }
    );
    if (error) {
      logger.error(LOG, 'Database error resolving effective mess categories', error);
      throw new Error(error.message || 'Failed to resolve mess categories');
    }
    return ((data ?? []) as Array<{ category_id: string }>).map((r) => r.category_id);
  }

  // ─── Dropdown option loaders ───────────────────────────────────────────
  // Read the LOCAL institutions table (the FK target), not the JKKN API —
  // institution_id in the eligibility tables references institutions(id).
  static async getInstitutions(): Promise<InstitutionOption[]> {
    const { data, error } = await this.supabase
      .from('institutions')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) {
      logger.error(LOG, 'Database error loading institutions', error);
      throw new Error(error.message || 'Failed to load institutions');
    }
    return (data ?? []) as InstitutionOption[];
  }

  static async getProgramsForInstitution(
    institutionId: string
  ): Promise<ProgramOption[]> {
    const { data, error } = await this.supabase
      .from('programs')
      .select('id, program_name')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('program_name', { ascending: true });
    if (error) {
      logger.error(LOG, 'Database error loading programs', error);
      throw new Error(error.message || 'Failed to load programs');
    }
    return (data ?? []) as ProgramOption[];
  }

  static async getActiveRoomCategories(): Promise<CategoryOption[]> {
    const { data, error } = await this.supabase
      .from('hostel_categories')
      .select('id, name, type')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      logger.error(LOG, 'Database error loading room categories', error);
      throw new Error(error.message || 'Failed to load room categories');
    }
    return (data ?? []) as CategoryOption[];
  }

  static async getActiveMessCategories(): Promise<CategoryOption[]> {
    const { data, error } = await this.supabase
      .from('mess_categories')
      .select('id, name, type')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      logger.error(LOG, 'Database error loading mess categories', error);
      throw new Error(error.message || 'Failed to load mess categories');
    }
    return (data ?? []) as CategoryOption[];
  }

  static async getActiveQuotas(): Promise<QuotaOption[]> {
    const { data, error } = await this.supabase
      .from('quotas')
      .select('id, code, name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      logger.error(LOG, 'Database error loading quotas', error);
      throw new Error(error.message || 'Failed to load quotas');
    }
    return (data ?? []) as QuotaOption[];
  }
}
