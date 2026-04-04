import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { FavoritePage } from '@/lib/navigation/types';

const supabase = createClientSupabaseClient();

export class FavoritesService {
  /**
   * Get all favorites for a user, sorted by sort_order.
   */
  static async getUserFavorites(userId: string): Promise<FavoritePage[]> {
    const { data, error } = await supabase
      .from('user_page_favorites')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      path: row.page_path,
      title: row.display_title,
      module: row.module_name || '',
      iconName: row.icon_name || 'FileText',
      sortOrder: row.sort_order,
      isPinned: row.is_pinned,
    }));
  }

  /**
   * Add a page to favorites.
   */
  static async addFavorite(
    userId: string,
    page: { path: string; title: string; module: string; iconName: string }
  ): Promise<FavoritePage> {
    // Get current max sort_order to add at end
    const { data: existing } = await supabase
      .from('user_page_favorites')
      .select('sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from('user_page_favorites')
      .insert({
        user_id: userId,
        page_path: page.path,
        display_title: page.title,
        module_name: page.module,
        icon_name: page.iconName,
        sort_order: nextOrder,
        is_pinned: false,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      path: data.page_path,
      title: data.display_title,
      module: data.module_name || '',
      iconName: data.icon_name || 'FileText',
      sortOrder: data.sort_order,
      isPinned: data.is_pinned,
    };
  }

  /**
   * Remove a page from favorites.
   */
  static async removeFavorite(userId: string, pagePath: string): Promise<void> {
    const { error } = await supabase
      .from('user_page_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('page_path', pagePath);

    if (error) throw error;
  }

  /**
   * Toggle pin status for a favorite.
   */
  static async togglePin(userId: string, pagePath: string, isPinned: boolean): Promise<void> {
    const { error } = await supabase
      .from('user_page_favorites')
      .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('page_path', pagePath);

    if (error) throw error;
  }

  /**
   * Update sort order for multiple favorites (after drag-reorder).
   */
  static async updateFavoriteOrder(
    userId: string,
    orderedPaths: string[]
  ): Promise<void> {
    // Update each favorite's sort_order based on its index
    const updates = orderedPaths.map((path, index) =>
      supabase
        .from('user_page_favorites')
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('page_path', path)
    );

    const results = await Promise.all(updates);
    const firstError = results.find(r => r.error);
    if (firstError?.error) throw firstError.error;
  }

  /**
   * Check if a page is favorited by a user.
   */
  static async isFavorite(userId: string, pagePath: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('user_page_favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('page_path', pagePath)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  }
}
