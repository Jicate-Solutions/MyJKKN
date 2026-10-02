import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type { HostelDamageType, HostelDamageTypeInput } from '@/types/hostel-vacate';

const LOG = 'campus-living/damage-types';

/** Supabase errors are plain objects: log the raw one, throw a real Error the toast can read. */
function fail(context: string, error: unknown): never {
  logger.error(LOG, context, error);
  throw new Error(getErrorMessage(error));
}

/**
 * Master list of room-damage types the warden picks from during a vacate
 * inspection (one global list). Types are deactivated, never deleted — a
 * recorded damage keeps a name snapshot, and there is no DELETE policy.
 */
export class HostelDamageTypeService {
  static async list(): Promise<HostelDamageType[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_damage_types')
      .select('*')
      .order('sort_order')
      .order('name')
      .order('id');
    if (error) fail('Failed to load damage types', error);
    return (data ?? []) as unknown as HostelDamageType[];
  }

  static async create(input: HostelDamageTypeInput, userId: string) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_damage_types')
      .insert({
        name: input.name.trim(),
        default_amount: input.default_amount,
        sort_order: input.sort_order ?? 100,
        is_active: input.is_active ?? true,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (error) fail('Failed to create damage type', error);
    return data as unknown as HostelDamageType;
  }

  static async update(id: string, input: Partial<HostelDamageTypeInput>, userId: string) {
    const patch: Record<string, unknown> = { updated_by: userId };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.default_amount !== undefined) patch.default_amount = input.default_amount;
    if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
    if (input.is_active !== undefined) patch.is_active = input.is_active;

    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_damage_types')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) fail('Failed to update damage type', error);
    return data as unknown as HostelDamageType;
  }
}
