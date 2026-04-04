import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { PageMetadata } from '@/lib/navigation/types';

const supabase = createClientSupabaseClient();

function mapRow(row: any): PageMetadata {
  return {
    id: row.id,
    pagePath: row.page_path,
    customTitle: row.custom_title,
    description: row.description,
    keywords: row.keywords || [],
    category: row.category,
    isSearchable: row.is_searchable,
    shortcutKey: row.shortcut_key || null,
    updatedBy: row.updated_by,
  };
}

export class PageMetadataService {
  /**
   * Get all page metadata entries.
   */
  static async getAllMetadata(): Promise<PageMetadata[]> {
    const { data, error } = await supabase
      .from('page_metadata')
      .select('*')
      .order('page_path', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapRow);
  }

  /**
   * Get metadata for a specific page path.
   */
  static async getMetadataByPath(pagePath: string): Promise<PageMetadata | null> {
    const { data, error } = await supabase
      .from('page_metadata')
      .select('*')
      .eq('page_path', pagePath)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return mapRow(data);
  }

  /**
   * Create or update page metadata (upsert by page_path).
   */
  static async upsertMetadata(
    metadata: {
      pagePath: string;
      customTitle?: string;
      description?: string;
      keywords: string[];
      category?: string;
      isSearchable: boolean;
      shortcutKey?: string | null;
    },
    userId: string,
    institutionId?: string
  ): Promise<PageMetadata> {
    const { data, error } = await supabase
      .from('page_metadata')
      .upsert(
        {
          page_path: metadata.pagePath,
          custom_title: metadata.customTitle || null,
          description: metadata.description || null,
          keywords: metadata.keywords,
          category: metadata.category || null,
          is_searchable: metadata.isSearchable,
          shortcut_key: metadata.shortcutKey || null,
          updated_by: userId,
          institution_id: institutionId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'page_path' }
      )
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  /**
   * Delete page metadata.
   */
  static async deleteMetadata(pagePath: string): Promise<void> {
    const { error } = await supabase
      .from('page_metadata')
      .delete()
      .eq('page_path', pagePath);

    if (error) throw error;
  }

  /**
   * Get all pages that have shortcuts assigned.
   */
  static async getShortcutAssignments(): Promise<PageMetadata[]> {
    const { data, error } = await supabase
      .from('page_metadata')
      .select('*')
      .not('shortcut_key', 'is', null)
      .order('shortcut_key', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapRow);
  }
}
