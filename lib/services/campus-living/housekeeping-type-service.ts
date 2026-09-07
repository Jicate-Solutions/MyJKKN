import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import { expenseTotal } from './housekeeping-rules';
import type {
  CleaningType,
  CleaningTypeExpense,
  CleaningTypeWithDetail,
  CreateCleaningTypeDto,
  UpdateCleaningTypeDto,
} from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-types';

export class HousekeepingTypeService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * The catalogue is GLOBAL — there is no institution to scope by. A type is
   * reachable to a learner through its room-category junction, not through
   * tenancy, so every reader sees the same list.
   */
  static async listTypes(): Promise<CleaningTypeWithDetail[]> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaning_types')
        .select(`*,
                 expenses:hostel_cleaning_type_expenses(*),
                 categories:hostel_cleaning_type_categories(category_id)`)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) {
        logger.error(LOG, 'Failed to list cleaning types', error);
        throw error;
      }

      return (data ?? []).map((row: any) => {
        const expenses = (row.expenses ?? []) as CleaningTypeExpense[];
        return {
          ...(row as CleaningType),
          expenses,
          category_ids: (row.categories ?? []).map((c: any) => c.category_id),
          expected_cost_inr: expenseTotal(expenses),
        };
      });
    } catch (error) {
      logger.error(LOG, `Unexpected error in listTypes: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async getType(typeId: string): Promise<CleaningTypeWithDetail | null> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaning_types')
        .select(`*,
                 expenses:hostel_cleaning_type_expenses(*),
                 categories:hostel_cleaning_type_categories(category_id)`)
        .eq('id', typeId)
        .maybeSingle();
      if (error) {
        logger.error(LOG, 'Failed to fetch cleaning type', error);
        throw error;
      }
      if (!data) return null;
      const expenses = ((data as any).expenses ?? []) as CleaningTypeExpense[];
      return {
        ...(data as unknown as CleaningType),
        expenses,
        category_ids: ((data as any).categories ?? []).map((c: any) => c.category_id),
        expected_cost_inr: expenseTotal(expenses),
      };
    } catch (error) {
      logger.error(LOG, `Unexpected error in getType: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Ordered so a partial failure fails SAFE. The type row is written first,
   * then expenses, then the category junction LAST — because an empty junction
   * means nobody can book the type. A type stranded without categories is
   * invisible, which is recoverable; a type visible with the wrong cost or the
   * wrong eligibility is not.
   */
  static async createType(dto: CreateCleaningTypeDto): Promise<CleaningType> {
    try {
      const { data: type, error } = await this.supabase
        .from('hostel_cleaning_types')
        .insert({
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          duration_minutes: dto.duration_minutes,
          usage_limit_count: dto.usage_limit_count,
          usage_period: dto.usage_period,
          is_active: dto.is_active ?? true,
          sort_order: dto.sort_order ?? 0,
        })
        .select()
        .single();

      if (error) {
        logger.error(LOG, 'Failed to create cleaning type', error);
        throw error;
      }

      const created = type as unknown as CleaningType;
      await this.replaceExpenses(created.id, dto.expenses);
      await this.replaceCategories(created.id, dto.category_ids);
      return created;
    } catch (error) {
      logger.error(LOG, `Unexpected error in createType: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async updateType(typeId: string, dto: UpdateCleaningTypeDto): Promise<void> {
    try {
      const patch: Record<string, unknown> = {};
      if (dto.name !== undefined) patch.name = dto.name.trim();
      if (dto.description !== undefined) patch.description = dto.description?.trim() || null;
      if (dto.duration_minutes !== undefined) patch.duration_minutes = dto.duration_minutes;
      if (dto.usage_limit_count !== undefined) patch.usage_limit_count = dto.usage_limit_count;
      if (dto.usage_period !== undefined) patch.usage_period = dto.usage_period;
      if (dto.is_active !== undefined) patch.is_active = dto.is_active;
      if (dto.sort_order !== undefined) patch.sort_order = dto.sort_order;

      if (Object.keys(patch).length > 0) {
        const { error } = await this.supabase
          .from('hostel_cleaning_types')
          .update(patch)
          .eq('id', typeId);
        if (error) {
          logger.error(LOG, 'Failed to update cleaning type', error);
          throw error;
        }
      }

      if (dto.expenses !== undefined) {
        await this.replaceExpenses(typeId, dto.expenses);
      }
      if (dto.category_ids !== undefined) {
        await this.replaceCategories(typeId, dto.category_ids);
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in updateType: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Deleting is refused by the database (ON DELETE RESTRICT) once any booking
   * references the type — history must survive. Deactivate instead; the UI
   * surfaces that message on 23503.
   */
  static async deleteType(typeId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('hostel_cleaning_types')
        .delete()
        .eq('id', typeId);
      if (error) {
        logger.error(LOG, 'Failed to delete cleaning type', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in deleteType: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /** Active types whose category set includes this room's category. */
  static async listBookableTypesForRoom(roomId: string): Promise<CleaningTypeWithDetail[]> {
    try {
      const { data: room, error: roomErr } = await this.supabase
        .from('hostel_rooms')
        .select('category_id')
        .eq('id', roomId)
        .maybeSingle();
      if (roomErr) {
        logger.error(LOG, 'Failed to read room category', roomErr);
        throw roomErr;
      }
      const categoryId = (room as { category_id: string | null } | null)?.category_id;
      // No category => nothing is bookable. Fails closed, matching the RPC.
      if (!categoryId) return [];

      const { data, error } = await this.supabase
        .from('hostel_cleaning_type_categories')
        .select(`type_id,
                 type:hostel_cleaning_types(*)`)
        .eq('category_id', categoryId);
      if (error) {
        logger.error(LOG, 'Failed to list bookable types', error);
        throw error;
      }

      return (data ?? [])
        .map((r: any) => r.type)
        .filter((t: any) => t && t.is_active)
        .sort((a: any, b: any) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((t: any) => ({
          ...(t as CleaningType),
          expenses: [],          // learners never read expense lines (RLS denies it)
          category_ids: [categoryId],
          expected_cost_inr: 0,
        }));
    } catch (error) {
      logger.error(LOG, `Unexpected error in listBookableTypesForRoom: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  // ── private helpers ────────────────────────────────────────────────────

  private static async replaceExpenses(
    typeId: string,
    lines: CreateCleaningTypeDto['expenses'],
  ): Promise<void> {
    const { error: delErr } = await this.supabase
      .from('hostel_cleaning_type_expenses')
      .delete()
      .eq('type_id', typeId);
    if (delErr) {
      logger.error(LOG, 'Failed to clear expense lines', delErr);
      throw delErr;
    }
    if (lines.length === 0) return;

    // Every row in a batch insert must carry identical keys: a missing key is
    // sent as an explicit NULL and defeats the column DEFAULT.
    const rows = lines.map((l, i) => ({
      type_id: typeId,
      item_name: l.item_name.trim(),
      unit: l.unit?.trim() || null,
      quantity: l.quantity,
      unit_cost_inr: l.unit_cost_inr,
      sort_order: l.sort_order ?? i,
    }));
    const { error } = await this.supabase.from('hostel_cleaning_type_expenses').insert(rows);
    if (error) {
      logger.error(LOG, 'Failed to insert expense lines', error);
      throw error;
    }
  }

  private static async replaceCategories(typeId: string, categoryIds: string[]): Promise<void> {
    const { error: delErr } = await this.supabase
      .from('hostel_cleaning_type_categories')
      .delete()
      .eq('type_id', typeId);
    if (delErr) {
      logger.error(LOG, 'Failed to clear category eligibility', delErr);
      throw delErr;
    }
    if (categoryIds.length === 0) return;

    const { error } = await this.supabase
      .from('hostel_cleaning_type_categories')
      .insert(categoryIds.map((category_id) => ({ type_id: typeId, category_id })));
    if (error) {
      logger.error(LOG, 'Failed to insert category eligibility', error);
      throw error;
    }
  }
}
