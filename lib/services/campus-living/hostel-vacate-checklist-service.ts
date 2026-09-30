import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type { VacateChecklistItem, VacateChecklistItemInput } from '@/types/hostel-vacate';

const LOG = 'campus-living/vacate-checklist';

function fail(context: string, error: unknown): never {
  logger.error(LOG, context, error);
  throw new Error(getErrorMessage(error));
}

/**
 * The master vacate checklist — ONE global list (no institution scope). Items
 * can be deactivated or deleted. Editing or deleting the master never touches a
 * request already submitted: its items were copied at submit, and
 * checklist_item_id is ON DELETE SET NULL.
 */
export class HostelVacateChecklistService {
  static async list(): Promise<VacateChecklistItem[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_vacate_checklist_items')
      .select('*')
      .order('sort_order')
      .order('created_at')
      .order('id');
    if (error) fail('Failed to load checklist items', error);
    return (data ?? []) as unknown as VacateChecklistItem[];
  }

  static async create(input: VacateChecklistItemInput, userId: string) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_vacate_checklist_items')
      .insert({
        item_label: input.item_label.trim(),
        description: input.description?.trim() || null,
        is_required: input.is_required,
        applies_to_reasons: input.applies_to_reasons?.length ? input.applies_to_reasons : null,
        sort_order: input.sort_order ?? 100,
        is_active: input.is_active ?? true,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (error) fail('Failed to create checklist item', error);
    return data as unknown as VacateChecklistItem;
  }

  static async update(id: string, input: Partial<VacateChecklistItemInput>, userId: string) {
    const patch: Record<string, unknown> = { updated_by: userId };
    if (input.item_label !== undefined) patch.item_label = input.item_label.trim();
    if (input.description !== undefined) patch.description = input.description?.trim() || null;
    if (input.is_required !== undefined) patch.is_required = input.is_required;
    if (input.applies_to_reasons !== undefined) {
      patch.applies_to_reasons = input.applies_to_reasons?.length ? input.applies_to_reasons : null;
    }
    if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
    if (input.is_active !== undefined) patch.is_active = input.is_active;

    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_vacate_checklist_items')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) fail('Failed to update checklist item', error);
    return data as unknown as VacateChecklistItem;
  }

  /**
   * Hard delete. Requests already submitted keep their own copy of the item
   * (checklist_item_id is ON DELETE SET NULL); to retire an item without losing
   * the link, deactivate it instead.
   */
  static async remove(id: string) {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase.from('hostel_vacate_checklist_items').delete().eq('id', id);
    if (error) fail('Failed to delete checklist item', error);
  }

  /** Persist a new order: ids in display order -> sort_order 10, 20, 30… */
  static async reorder(orderedIds: string[], userId: string) {
    const supabase = createClientSupabaseClient();
    const results = await Promise.all(
      orderedIds.map((id, idx) =>
        supabase
          .from('hostel_vacate_checklist_items')
          .update({ sort_order: (idx + 1) * 10, updated_by: userId })
          .eq('id', id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) fail('Failed to reorder checklist items', failed.error);
  }
}
