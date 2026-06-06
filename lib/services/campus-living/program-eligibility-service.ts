import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  ProgramRoomEligibility,
  ProgramRoomEligibilityRow,
  CreateProgramRoomEligibilityDto,
  UpdateProgramRoomEligibilityDto,
  ProgramMessEligibility,
  ProgramMessEligibilityRow,
  CreateProgramMessEligibilityDto,
  UpdateProgramMessEligibilityDto,
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

  // ─── Room eligibility ──────────────────────────────────────────────────
  // institutionId omitted => list across ALL institutions (the settings page no
  // longer gates on a single institution; each row carries its own).
  static async getRoomEligibility(
    institutionId?: string,
    programId?: string | null
  ): Promise<ProgramRoomEligibilityRow[]> {
    let query = this.supabase
      .from('hostel_program_room_eligibility')
      .select(
        '*, institution:institutions(name), program:programs(program_name), quota:quotas(name), room_category:hostel_categories(name)'
      )
      .order('institution_id', { ascending: true })
      .order('program_id', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });

    if (institutionId) query = query.eq('institution_id', institutionId);

    // Explicit program filter: undefined => all rows; null => default rows only.
    if (programId !== undefined) {
      query = programId === null
        ? query.is('program_id', null)
        : query.eq('program_id', programId);
    }

    const { data, error } = await query;
    if (error) {
      logger.error(LOG, 'Database error listing room eligibility', error);
      throw new Error(error.message || 'Failed to fetch room eligibility');
    }

    return (data ?? []).map((r: Record<string, unknown>) => {
      const institution = r.institution as { name?: string } | null;
      const program = r.program as { program_name?: string } | null;
      const quota = r.quota as { name?: string } | null;
      const category = r.room_category as { name?: string } | null;
      const { institution: _i, program: _p, quota: _q, room_category: _c, ...rest } = r;
      return {
        ...(rest as ProgramRoomEligibility),
        institution_name: institution?.name ?? null,
        program_name: program?.program_name ?? null,
        quota_name: quota?.name ?? null,
        room_category_name: category?.name ?? null,
      };
    });
  }

  static async createRoomEligibility(
    dto: CreateProgramRoomEligibilityDto
  ): Promise<ProgramRoomEligibility> {
    const { data, error } = await this.supabase
      .from('hostel_program_room_eligibility')
      .insert([{ ...dto, program_id: dto.program_id ?? null, quota_id: dto.quota_id || null, fee_min: dto.fee_min ?? null, fee_max: dto.fee_max ?? null }])
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'Database error creating room eligibility', error);
      throw new Error(
        error.code === '23505'
          ? 'This category is already configured for the selected program (or institution default).'
          : error.message || 'Failed to create room eligibility'
      );
    }
    return data as ProgramRoomEligibility;
  }

  static async updateRoomEligibility(
    id: string,
    dto: UpdateProgramRoomEligibilityDto
  ): Promise<ProgramRoomEligibility> {
    const { data, error } = await this.supabase
      .from('hostel_program_room_eligibility')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'Database error updating room eligibility', error);
      throw new Error(error.message || 'Failed to update room eligibility');
    }
    return data as ProgramRoomEligibility;
  }

  static async deleteRoomEligibility(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_program_room_eligibility')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error(LOG, 'Database error deleting room eligibility', error);
      throw new Error(error.message || 'Failed to delete room eligibility');
    }
  }

  // ─── Mess eligibility ──────────────────────────────────────────────────
  static async getMessEligibility(
    institutionId?: string,
    programId?: string | null
  ): Promise<ProgramMessEligibilityRow[]> {
    let query = this.supabase
      .from('hostel_program_mess_eligibility')
      .select(
        '*, institution:institutions(name), program:programs(program_name), quota:quotas(name), mess_category:mess_categories(name)'
      )
      .order('institution_id', { ascending: true })
      .order('program_id', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });

    if (institutionId) query = query.eq('institution_id', institutionId);

    if (programId !== undefined) {
      query = programId === null
        ? query.is('program_id', null)
        : query.eq('program_id', programId);
    }

    const { data, error } = await query;
    if (error) {
      logger.error(LOG, 'Database error listing mess eligibility', error);
      throw new Error(error.message || 'Failed to fetch mess eligibility');
    }

    return (data ?? []).map((r: Record<string, unknown>) => {
      const institution = r.institution as { name?: string } | null;
      const program = r.program as { program_name?: string } | null;
      const quota = r.quota as { name?: string } | null;
      const category = r.mess_category as { name?: string } | null;
      const { institution: _i, program: _p, quota: _q, mess_category: _c, ...rest } = r;
      return {
        ...(rest as ProgramMessEligibility),
        institution_name: institution?.name ?? null,
        program_name: program?.program_name ?? null,
        quota_name: quota?.name ?? null,
        mess_category_name: category?.name ?? null,
      };
    });
  }

  static async createMessEligibility(
    dto: CreateProgramMessEligibilityDto
  ): Promise<ProgramMessEligibility> {
    const { data, error } = await this.supabase
      .from('hostel_program_mess_eligibility')
      .insert([{ ...dto, program_id: dto.program_id ?? null, quota_id: dto.quota_id || null, fee_min: dto.fee_min ?? null, fee_max: dto.fee_max ?? null }])
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'Database error creating mess eligibility', error);
      throw new Error(
        error.code === '23505'
          ? 'This category is already configured for the selected program (or institution default).'
          : error.message || 'Failed to create mess eligibility'
      );
    }
    return data as ProgramMessEligibility;
  }

  static async updateMessEligibility(
    id: string,
    dto: UpdateProgramMessEligibilityDto
  ): Promise<ProgramMessEligibility> {
    const { data, error } = await this.supabase
      .from('hostel_program_mess_eligibility')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'Database error updating mess eligibility', error);
      throw new Error(error.message || 'Failed to update mess eligibility');
    }
    return data as ProgramMessEligibility;
  }

  static async deleteMessEligibility(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_program_mess_eligibility')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error(LOG, 'Database error deleting mess eligibility', error);
      throw new Error(error.message || 'Failed to delete mess eligibility');
    }
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
