import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { PageMetadata } from '@/lib/navigation/types';

const supabase = createClientSupabaseClient();

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

    return (data || []).map(row => ({
      id: row.id,
      pagePath: row.page_path,
      customTitle: row.custom_title,
      description: row.description,
      keywords: row.keywords || [],
      category: row.category,
      isSearchable: row.is_searchable,
      updatedBy: row.updated_by,
    }));
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

    return {
      id: data.id,
      pagePath: data.page_path,
      customTitle: data.custom_title,
      description: data.description,
      keywords: data.keywords || [],
      category: data.category,
      isSearchable: data.is_searchable,
      updatedBy: data.updated_by,
    };
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
          updated_by: userId,
          institution_id: institutionId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'page_path' }
      )
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      pagePath: data.page_path,
      customTitle: data.custom_title,
      description: data.description,
      keywords: data.keywords || [],
      category: data.category,
      isSearchable: data.is_searchable,
      updatedBy: data.updated_by,
    };
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
}
