import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'campus-living/category-room-sources';

/**
 * Extra room categories a hostel category may seat its learners in.
 *
 * A category's NATIVE pool has always been COALESCE(room_source_category_id, id)
 * — a single redirect. This table adds more sources on top of that, so Premium
 * can draw on Deluxe rooms while the learner keeps the Premium category, the
 * Premium fee and every Premium benefit.
 *
 * Reads here are for the settings screen only. Every room query resolves the
 * pool through fn_cl_category_room_sources() in Postgres, which also yields the
 * native source — never rebuild that union in TypeScript.
 */
export interface CategoryRoomSource {
  id: string;
  category_id: string;
  source_category_id: string;
  sort_order: number;
  is_active: boolean;
}

export class HostelCategoryRoomSourceService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** Every mapping row, for the settings table's badges. */
  static async listAll(): Promise<CategoryRoomSource[]> {
    const { data, error } = await this.supabase
      .from('hostel_category_room_sources')
      .select('id, category_id, source_category_id, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      logger.error(LOG, 'Failed to list category room sources', error);
      throw new Error(error.message || 'Failed to load room sources');
    }
    return (data ?? []) as CategoryRoomSource[];
  }

  static async listForCategory(categoryId: string): Promise<CategoryRoomSource[]> {
    if (!categoryId) return [];
    const { data, error } = await this.supabase
      .from('hostel_category_room_sources')
      .select('id, category_id, source_category_id, sort_order, is_active')
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      logger.error(LOG, 'Failed to list room sources for category', error);
      throw new Error(error.message || 'Failed to load room sources');
    }
    return (data ?? []) as CategoryRoomSource[];
  }

  /**
   * Replace a category's extra sources with exactly `sourceCategoryIds`.
   *
   * Deletes the rows that fell out, then upserts the rest. Not a transaction —
   * PostgREST has none — but the two halves are independent: a half-applied
   * change removes or adds a source, it can never corrupt one.
   */
  static async setSources(categoryId: string, sourceCategoryIds: string[]): Promise<void> {
    const wanted = Array.from(new Set(sourceCategoryIds.filter(Boolean)));

    let del = this.supabase
      .from('hostel_category_room_sources')
      .delete()
      .eq('category_id', categoryId);
    if (wanted.length > 0) del = del.not('source_category_id', 'in', `(${wanted.join(',')})`);
    const { error: delError } = await del;
    if (delError) {
      logger.error(LOG, 'Failed to remove room sources', delError);
      throw new Error(delError.message || 'Failed to update room sources');
    }

    if (wanted.length === 0) return;

    const { error: upError } = await this.supabase
      .from('hostel_category_room_sources')
      .upsert(
        wanted.map((sourceId, i) => ({
          category_id: categoryId,
          source_category_id: sourceId,
          sort_order: i + 1,
          is_active: true,
        })),
        { onConflict: 'category_id,source_category_id' },
      );
    if (upError) {
      logger.error(LOG, 'Failed to save room sources', upError);
      throw new Error(upError.message || 'Failed to update room sources');
    }
  }
}
