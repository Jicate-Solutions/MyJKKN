import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  PostalCode,
  PincodeLookupResult,
  PostalCodeFilters,
  CreatePostalCodeInput,
  UpdatePostalCodeInput,
} from '@/types/postal-code';

/**
 * Postal Code master — static global lookup (no institution scoping).
 * Reads are open to authenticated users via RLS; the table has no write
 * policies (seeded once via service role).
 */
export class PostalCodeService {
  /** All active post offices for a 6-digit pincode + the distinct districts. */
  static async lookupPincode(pincode: string): Promise<PincodeLookupResult> {
    const pin = pincode.trim();
    if (!/^[0-9]{6}$/.test(pin)) return { offices: [], districts: [] };

    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('postal_codes')
      .select('*')
      .eq('pincode', pin)
      .eq('is_active', true)
      .order('office_name', { ascending: true });
    if (error) throw error;

    const offices = (data ?? []) as PostalCode[];
    const districts = [...new Map(offices.map((o) => [o.district_id, o])).values()].map(
      (o) => ({ district: o.district, district_id: o.district_id }),
    );
    return { offices, districts };
  }

  static async getById(id: string): Promise<PostalCode | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('postal_codes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as PostalCode | null;
  }

  /** Paginated management list. Search matches office name (contains) or pincode (prefix). */
  static async list(filters: PostalCodeFilters): Promise<{ rows: PostalCode[]; total: number }> {
    const supabase = createClientSupabaseClient();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 25;
    const from = (page - 1) * limit;

    const SORTABLE = new Set([
      'pincode', 'office_name', 'division', 'district', 'is_active', 'created_at',
    ]);
    const sortBy = filters.sortBy && SORTABLE.has(filters.sortBy) ? filters.sortBy : 'pincode';
    const ascending = filters.sortOrder !== 'desc';

    let query = supabase
      .from('postal_codes')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending })
      .order('office_name', { ascending: true })
      .range(from, from + limit - 1);

    if (filters.district) query = query.eq('district', filters.district);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
    const term = filters.search?.trim();
    if (term) {
      if (/^[0-9]{1,6}$/.test(term)) {
        query = query.ilike('pincode', `${term}%`);
      } else {
        query = query.ilike('office_name', `%${term.replace(/[%_]/g, '\\$&')}%`);
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: (data ?? []) as PostalCode[], total: count ?? 0 };
  }

  static async create(input: CreatePostalCodeInput): Promise<PostalCode> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('postal_codes')
      .insert({ ...input, office_name: input.office_name.trim(), pincode: input.pincode.trim() })
      .select('*')
      .single();
    if (error) throw error;
    return data as PostalCode;
  }

  static async update(id: string, input: UpdatePostalCodeInput): Promise<PostalCode> {
    const supabase = createClientSupabaseClient();
    const payload = { ...input };
    if (payload.office_name) payload.office_name = payload.office_name.trim();
    if (payload.pincode) payload.pincode = payload.pincode.trim();
    const { data, error } = await supabase
      .from('postal_codes')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as PostalCode;
  }

  static async delete(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase.from('postal_codes').delete().eq('id', id);
    if (error) throw error;
  }
}
