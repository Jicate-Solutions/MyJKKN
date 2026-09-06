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
 * One selectable hostel room / mess tier for a fee structure. `id` is the
 * CANONICAL row for that name — see listHostelRoomCategoryOptions.
 */
export interface HostelTierOption {
  id: string;
  name: string;
}

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

  // ---------------- accommodation_types (global lookup) ----------------

  static async listAccommodationTypes(
    activeOnly = true,
  ): Promise<AdmissionFeeAccommodationType[]> {
    const supabase = createClientSupabaseClient();
    const query = supabase
      .from('accommodation_types')
      .select('*')
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

  static async listAllActiveAccommodationTypes(): Promise<AdmissionFeeAccommodationType[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('accommodation_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  // ------- hostel room / mess tiers for the fee structure (global) -------
  //
  // hostel_categories and mess_categories are GENDER-PARTITIONED: "Classic
  // Room" exists as both type='boys' and type='girls'. A fee structure
  // normally leaves `gender` NULL because it covers both, so the picker offers
  // one entry PER NAME and the stored id is a canonical handle — its `type` is
  // not semantically meaningful. Readers remap by `name` to the learner's own
  // gender variant, the same way fn_apply_hostel_fee_categories does.
  //
  // Only names present for EVERY gender variant are offered: a name that
  // exists for boys but not girls would resolve to nothing for a girl learner.

  private static dedupeByNameAcrossGenders(
    rows: Array<{ id: string; name: string; type: string | null; sort_order: number | null }>,
  ): HostelTierOption[] {
    const genders = new Set(rows.map((r) => r.type).filter((t): t is string => !!t));
    const byName = new Map<string, typeof rows>();
    for (const r of rows) {
      const bucket = byName.get(r.name);
      if (bucket) bucket.push(r);
      else byName.set(r.name, [r]);
    }
    const options: HostelTierOption[] = [];
    for (const [name, bucket] of byName) {
      const covered = new Set(bucket.map((r) => r.type).filter((t): t is string => !!t));
      if (genders.size > 0 && covered.size < genders.size) continue;
      // Canonical row = lowest (type, sort_order) — matches the backfill in
      // migration 20260910110000 so the UI and the DB agree on which id
      // represents a given name.
      const canonical = [...bucket].sort(
        (a, b) =>
          (a.type ?? '').localeCompare(b.type ?? '') ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0),
      )[0];
      options.push({ id: canonical.id, name });
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }

  static async listHostelRoomCategoryOptions(): Promise<HostelTierOption[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_categories')
      .select('id, name, type, sort_order')
      .eq('is_active', true);
    if (error) throw error;
    return this.dedupeByNameAcrossGenders(data ?? []);
  }

  static async listMessCategoryOptions(): Promise<HostelTierOption[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('mess_categories')
      .select('id, name, type, sort_order')
      .eq('is_active', true);
    if (error) throw error;
    return this.dedupeByNameAcrossGenders(data ?? []);
  }
}
