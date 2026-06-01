import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Read/write access to the `castes` lookup table — child of community_categories
 * (TN reservation taxonomy). Mirrors LookupService's community_categories
 * methods. Castes are global (no institution scope); read is open to anon (the
 * public QR student form), writes gated by RLS on `admission_fees.manage`.
 *
 * Every mutation destructures { error } and surfaces it — never silent.
 */

export interface Caste {
  id: string;
  community_category_id: string;
  name: string;
  aliases: string[];
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateCasteInput {
  community_category_id: string;
  name: string;
  aliases?: string[];
  notes?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export type UpdateCasteInput = Partial<
  Pick<Caste, 'community_category_id' | 'name' | 'aliases' | 'notes' | 'sort_order' | 'is_active'>
>;

export class CasteService {
  /** All castes (optionally active-only), ordered for display. */
  static async list(activeOnly = true): Promise<Caste[]> {
    const supabase = createClientSupabaseClient();
    const query = supabase
      .from('castes')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    const { data, error } = activeOnly ? await query.eq('is_active', true) : await query;
    if (error) throw error;
    return (data ?? []) as Caste[];
  }

  /** Castes under one community category. Empty array when no community given. */
  static async listByCommunity(
    communityCategoryId: string | null | undefined,
    activeOnly = true,
  ): Promise<Caste[]> {
    if (!communityCategoryId) return [];
    const supabase = createClientSupabaseClient();
    const query = supabase
      .from('castes')
      .select('*')
      .eq('community_category_id', communityCategoryId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    const { data, error } = activeOnly ? await query.eq('is_active', true) : await query;
    if (error) throw error;
    return (data ?? []) as Caste[];
  }

  static async get(id: string): Promise<Caste | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.from('castes').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as Caste) ?? null;
  }

  static async create(input: CreateCasteInput): Promise<Caste> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.from('castes').insert(input).select('*').single();
    if (error) throw error;
    return data as Caste;
  }

  static async update(id: string, input: UpdateCasteInput): Promise<Caste> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('castes')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Caste;
  }

  /** Soft-delete (archive) — sets is_active=false to preserve FK references. */
  static async archive(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase.from('castes').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  }
}
