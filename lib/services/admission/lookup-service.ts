import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionFeeQuota,
  CreateAdmissionFeeQuotaInput,
  UpdateAdmissionFeeQuotaInput,
  AdmissionFeeCommunityCategory,
  CreateAdmissionFeeCommunityCategoryInput,
  UpdateAdmissionFeeCommunityCategoryInput,
  AdmissionFeeAccommodationType,
  CreateAdmissionFeeAccommodationTypeInput,
  UpdateAdmissionFeeAccommodationTypeInput,
} from '@/types/admission';

/**
 * Read/write access to the three lookup tables that anchor the admission
 * fee-structure matrix: quotas (global), community_categories (global),
 * accommodation_types (institution-scoped).
 *
 * Every mutation destructures { error } and surfaces it — never silent.
 */
export class LookupService {
  // ---------------- quotas (global) ----------------

  static async listQuotas(activeOnly = true): Promise<AdmissionFeeQuota[]> {
    const supabase = createClientSupabaseClient();
    const query = supabase
      .from('quotas')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    const { data, error } = activeOnly ? await query.eq('is_active', true) : await query;
    if (error) throw error;
    return data ?? [];
  }

  static async getQuota(id: string): Promise<AdmissionFeeQuota | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.from('quotas').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  static async createQuota(input: CreateAdmissionFeeQuotaInput): Promise<AdmissionFeeQuota> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('quotas')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async updateQuota(id: string, input: UpdateAdmissionFeeQuotaInput): Promise<AdmissionFeeQuota> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('quotas')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async archiveQuota(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase.from('quotas').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  }

  // ---------------- community_categories (global) ----------------

  static async listCommunityCategories(activeOnly = true): Promise<AdmissionFeeCommunityCategory[]> {
    const supabase = createClientSupabaseClient();
    const query = supabase
      .from('community_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    const { data, error } = activeOnly ? await query.eq('is_active', true) : await query;
    if (error) throw error;
    return data ?? [];
  }

  static async getCommunityCategory(id: string): Promise<AdmissionFeeCommunityCategory | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('community_categories')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async createCommunityCategory(input: CreateAdmissionFeeCommunityCategoryInput): Promise<AdmissionFeeCommunityCategory> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('community_categories')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async updateCommunityCategory(
    id: string,
    input: UpdateAdmissionFeeCommunityCategoryInput,
  ): Promise<AdmissionFeeCommunityCategory> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('community_categories')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async archiveCommunityCategory(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('community_categories')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  }

  // ---------------- accommodation_types (institution-scoped) ----------------

  static async listAccommodationTypes(
    institutionId: string,
    activeOnly = true,
  ): Promise<AdmissionFeeAccommodationType[]> {
    const supabase = createClientSupabaseClient();
    const query = supabase
      .from('accommodation_types')
      .select('*')
      .eq('institution_id', institutionId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    const { data, error } = activeOnly ? await query.eq('is_active', true) : await query;
    if (error) throw error;
    return data ?? [];
  }

  static async getAccommodationType(id: string): Promise<AdmissionFeeAccommodationType | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('accommodation_types')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async createAccommodationType(input: CreateAdmissionFeeAccommodationTypeInput): Promise<AdmissionFeeAccommodationType> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('accommodation_types')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async updateAccommodationType(
    id: string,
    input: UpdateAdmissionFeeAccommodationTypeInput,
  ): Promise<AdmissionFeeAccommodationType> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('accommodation_types')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async archiveAccommodationType(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('accommodation_types')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  }
}
