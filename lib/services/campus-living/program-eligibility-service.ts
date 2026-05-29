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
  static async getRoomEligibility(
    institutionId: string,
    programId?: string | null
  ): Promise<ProgramRoomEligibilityRow[]> {
    let query = this.supabase
      .from('hostel_program_room_eligibility')
      .select(
        '*, program:programs(program_name), room_category:hostel_categories(name)'
      )
      .eq('institution_id', institutionId)
      .order('program_id', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });

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
      const program = r.program as { program_name?: string } | null;
      const category = r.room_category as { name?: string } | null;
      const { program: _p, room_category: _c, ...rest } = r;
      return {
        ...(rest as ProgramRoomEligibility),
        program_name: program?.program_name ?? null,
        room_category_name: category?.name ?? null,
      };
    });
  }

  static async createRoomEligibility(
    dto: CreateProgramRoomEligibilityDto
  ): Promise<ProgramRoomEligibility> {
    const { data, error } = await this.supabase
      .from('hostel_program_room_eligibility')
      .insert([{ ...dto, program_id: dto.program_id ?? null }])
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
    institutionId: string,
    programId?: string | null
  ): Promise<ProgramMessEligibilityRow[]> {
    let query = this.supabase
      .from('hostel_program_mess_eligibility')
      .select(
        '*, program:programs(program_name), mess_category:mess_categories(name)'
      )
      .eq('institution_id', institutionId)
      .order('program_id', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });

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
      const program = r.program as { program_name?: string } | null;
      const category = r.mess_category as { name?: string } | null;
      const { program: _p, mess_category: _c, ...rest } = r;
      return {
        ...(rest as ProgramMessEligibility),
        program_name: program?.program_name ?? null,
        mess_category_name: category?.name ?? null,
      };
    });
  }

  static async createMessEligibility(
    dto: CreateProgramMessEligibilityDto
  ): Promise<ProgramMessEligibility> {
    const { data, error } = await this.supabase
      .from('hostel_program_mess_eligibility')
      .insert([{ ...dto, program_id: dto.program_id ?? null }])
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

  // ─── Effective resolution helper (program override → institution default) ─
  // Returns the room_category_id set that applies to a given program: if the
  // program has any of its own override rows, those win; otherwise the
  // institution default rows apply. Only is_active rows count.
  static async getEffectiveRoomCategories(
    institutionId: string,
    programId: string
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('hostel_program_room_eligibility')
      .select('program_id, room_category_id, is_active')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .or(`program_id.eq.${programId},program_id.is.null`);
    if (error) {
      logger.error(LOG, 'Database error resolving effective room categories', error);
      throw new Error(error.message || 'Failed to resolve room categories');
    }
    const rows = (data ?? []) as Array<{
      program_id: string | null;
      room_category_id: string;
    }>;
    const overrides = rows.filter((r) => r.program_id === programId);
    const source = overrides.length > 0 ? overrides : rows.filter((r) => r.program_id === null);
    return Array.from(new Set(source.map((r) => r.room_category_id)));
  }

  static async getEffectiveMessCategories(
    institutionId: string,
    programId: string
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('hostel_program_mess_eligibility')
      .select('program_id, mess_category_id, is_active')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .or(`program_id.eq.${programId},program_id.is.null`);
    if (error) {
      logger.error(LOG, 'Database error resolving effective mess categories', error);
      throw new Error(error.message || 'Failed to resolve mess categories');
    }
    const rows = (data ?? []) as Array<{
      program_id: string | null;
      mess_category_id: string;
    }>;
    const overrides = rows.filter((r) => r.program_id === programId);
    const source = overrides.length > 0 ? overrides : rows.filter((r) => r.program_id === null);
    return Array.from(new Set(source.map((r) => r.mess_category_id)));
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
      .select('id, name')
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
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      logger.error(LOG, 'Database error loading mess categories', error);
      throw new Error(error.message || 'Failed to load mess categories');
    }
    return (data ?? []) as CategoryOption[];
  }
}
