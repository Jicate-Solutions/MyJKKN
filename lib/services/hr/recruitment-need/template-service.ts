/**
 * HR Template Library Service
 *
 * CRUD for hr_templates table. Static class, SupabaseClient as first arg.
 * Pattern: matches RecruitmentNeedSignalService in this directory.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRTemplate,
  HRTemplateInsert,
  HRTemplateUpdate,
  TemplateFilters,
} from '@/types/hr-templates';

export class TemplateService {
  // ─── List / Search ─────────────────────────────────────────────────────────

  static async listTemplates(
    supabase: SupabaseClient,
    filters: TemplateFilters = {}
  ): Promise<HRTemplate[]> {
    let query = supabase
      .from('hr_templates')
      .select('*')
      .order('category')
      .order('title');

    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    } else {
      // Default: only active
      query = query.eq('is_active', true);
    }
    if (filters.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRTemplate[];
  }

  // ─── Get Single ────────────────────────────────────────────────────────────

  static async getTemplate(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRTemplate | null> {
    const { data, error } = await supabase
      .from('hr_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as HRTemplate | null;
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  static async createTemplate(
    supabase: SupabaseClient,
    insert: HRTemplateInsert
  ): Promise<HRTemplate> {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    const { data, error } = await supabase
      .from('hr_templates')
      .insert({ ...insert, uploaded_by: userId })
      .select()
      .single();

    if (error) throw error;
    return data as HRTemplate;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  static async updateTemplate(
    supabase: SupabaseClient,
    id: string,
    update: HRTemplateUpdate
  ): Promise<HRTemplate> {
    const { data, error } = await supabase
      .from('hr_templates')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as HRTemplate;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  static async deleteTemplate(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_templates')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ─── Increment Download Count ──────────────────────────────────────────────

  static async incrementDownloadCount(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase.rpc('', {}).catch(() => null) as any;

    // Fallback: read-then-update (no custom RPC needed)
    const { data: current } = await supabase
      .from('hr_templates')
      .select('download_count')
      .eq('id', id)
      .single();

    if (current) {
      const { error: updateError } = await supabase
        .from('hr_templates')
        .update({ download_count: (current.download_count ?? 0) + 1 })
        .eq('id', id);

      if (updateError) throw updateError;
    }
  }
}
