// lib/services/admission/fee-structure-bulk-lookups.ts
//
// Server-side loaders for the bulk fee-structure routes. Accept an
// already-authenticated Supabase client (RLS applies, so cross-institution
// access is naturally scoped). Build the name→id maps resolveRow() consumes.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BulkResolveLookups } from '@/lib/utils/mappings/fee-structure-excel-mappings';

const EXCLUDED_KINDS = ['transport', 'hostel'];

/** Active billing categories that may be used as fee-structure items. */
export async function loadActiveFeeCategories(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; category_name: string }>> {
  const { data, error } = await supabase
    .from('billing_categories')
    .select('id, category_name, kind')
    .eq('is_active', true)
    .order('category_name');
  if (error) throw error;
  return (data ?? [])
    .filter((c: any) => !EXCLUDED_KINDS.includes(c.kind))
    .map((c: any) => ({ id: c.id, category_name: c.category_name }));
}

export async function loadBulkResolveLookups(
  supabase: SupabaseClient,
): Promise<BulkResolveLookups> {
  const [inst, deg, dept, prog, yrs, quo, comm, cats] = await Promise.all([
    supabase.from('institutions').select('id, name'),
    supabase.from('degrees').select('id, institution_id, degree_name'),
    supabase.from('departments').select('id, institution_id, degree_id, department_name'),
    supabase.from('programs').select('id, department_id, program_name'),
    supabase.from('admission_years').select('id, program_id, admission_year_name'),
    supabase.from('quotas').select('id, name'),
    supabase.from('community_categories').select('id, name'),
    loadActiveFeeCategories(supabase),
  ]);
  for (const r of [inst, deg, dept, prog, yrs, quo, comm]) {
    if (r.error) throw r.error;
  }
  const L = (v: string | null) => String(v ?? '').trim().toLowerCase();

  return {
    institutions: new Map((inst.data ?? []).map((r: any) => [L(r.name), r.id])),
    degrees: new Map((deg.data ?? []).map((r: any) => [`${r.institution_id}::${L(r.degree_name)}`, r.id])),
    departments: new Map((dept.data ?? []).map((r: any) => [`${r.institution_id}::${r.degree_id}::${L(r.department_name)}`, r.id])),
    programmes: new Map((prog.data ?? []).map((r: any) => [`${r.department_id}::${L(r.program_name)}`, r.id])),
    admissionYears: new Map((yrs.data ?? []).map((r: any) => [`${r.program_id}::${L(r.admission_year_name)}`, r.id])),
    quotas: new Map((quo.data ?? []).map((r: any) => [L(r.name), r.id])),
    communities: new Map((comm.data ?? []).map((r: any) => [L(r.name), r.id])),
    categoriesByName: new Map(cats.map((c) => [c.category_name.toLowerCase(), c.id])),
    amountHeaders: cats.map((c) => c.category_name),
  };
}
