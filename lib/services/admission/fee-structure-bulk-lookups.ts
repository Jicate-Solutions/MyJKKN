// lib/services/admission/fee-structure-bulk-lookups.ts
//
// Server-side loaders for the bulk fee-structure routes. Accept an
// already-authenticated Supabase client (RLS applies, so cross-institution
// access is naturally scoped). Build the name→id maps resolveRow() consumes.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BulkResolveLookups } from '@/lib/utils/mappings/fee-structure-excel-mappings';

// Mirrors FEE_STRUCTURE_EXCLUDED_CATEGORY_KINDS in fees-structure-form.tsx —
// hostel categories are selectable; only transport stays module-owned.
const EXCLUDED_KINDS = ['transport'];

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
  const [inst, deg, dept, prog, yrs, quo, acc, comm, rooms, messes, cats, statuses] = await Promise.all([
    supabase.from('institutions').select('id, name'),
    supabase.from('degrees').select('id, institution_id, degree_name'),
    supabase.from('departments').select('id, institution_id, degree_id, department_name'),
    supabase.from('programs').select('id, department_id, program_name'),
    supabase.from('admission_years').select('id, institution_id, admission_year_name'),
    supabase.from('quotas').select('id, name'),
    supabase.from('accommodation_types').select('id, code, name').eq('is_active', true),
    supabase.from('community_categories').select('id, name'),
    supabase.from('hostel_categories').select('id, name, type, sort_order').eq('is_active', true),
    supabase.from('mess_categories').select('id, name, type, sort_order').eq('is_active', true),
    loadActiveFeeCategories(supabase),
    // gates_login = false is the same filter the promotion engine and the
    // authoring UI apply. Excluding those rows here means a spreadsheet cannot
    // name a status that would be rejected at write time — the import fails on
    // the row, with a row number, instead of mid-batch at commit.
    supabase
      .from('admission_statuses')
      .select('code, label')
      .eq('scope', 'learner')
      .eq('is_active', true)
      .eq('gates_login', false),
  ]);
  for (const r of [inst, deg, dept, prog, yrs, quo, acc, comm, rooms, messes, statuses]) {
    if (r.error) throw r.error;
  }
  const L = (v: string | null) => String(v ?? '').trim().toLowerCase();

  // Accommodation resolves by display name OR code ("Day Scholar" / "dayscholar").
  const accommodations = new Map<string, string>();
  let hostelAccommodationId: string | null = null;
  for (const r of (acc.data ?? []) as any[]) {
    accommodations.set(L(r.name), r.id);
    accommodations.set(L(r.code), r.id);
    if (L(r.code) === 'hostel') hostelAccommodationId = r.id;
  }

  // hostel_categories / mess_categories are gender-partitioned ("Classic Room"
  // exists for boys AND girls), but a fee structure stores ONE canonical id and
  // readers remap by name to the learner's gender. Canonical = lowest
  // (type, sort_order), matching migration 20260910110000's backfill and
  // LookupService.listHostelRoomCategoryOptions.
  const canonicalByName = (rows: any[]): Map<string, string> => {
    const sorted = [...rows].sort(
      (a, b) =>
        String(a.type ?? '').localeCompare(String(b.type ?? '')) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    const map = new Map<string, string>();
    for (const r of sorted) {
      if (!map.has(L(r.name))) map.set(L(r.name), r.id);
    }
    return map;
  };

  return {
    institutions: new Map((inst.data ?? []).map((r: any) => [L(r.name), r.id])),
    degrees: new Map((deg.data ?? []).map((r: any) => [`${r.institution_id}::${L(r.degree_name)}`, r.id])),
    departments: new Map((dept.data ?? []).map((r: any) => [`${r.institution_id}::${r.degree_id}::${L(r.department_name)}`, r.id])),
    programmes: new Map((prog.data ?? []).map((r: any) => [`${r.department_id}::${L(r.program_name)}`, r.id])),
    admissionYears: new Map((yrs.data ?? []).map((r: any) => [`${r.institution_id}::${L(r.admission_year_name)}`, r.id])),
    quotas: new Map((quo.data ?? []).map((r: any) => [L(r.name), r.id])),
    accommodations,
    hostelAccommodationId,
    roomCategories: canonicalByName((rooms.data ?? []) as any[]),
    messCategories: canonicalByName((messes.data ?? []) as any[]),
    communities: new Map((comm.data ?? []).map((r: any) => [L(r.name), r.id])),
    categoriesByName: new Map(cats.map((c) => [c.category_name.toLowerCase(), c.id])),
    amountHeaders: cats.map((c) => c.category_name),
    // Both the label and the code map to the code, so a sheet may say either
    // "Reserved" or "reserved". gates_login rows are filtered OUT here, not in
    // the caller: afsis_validate_status_target rejects them at write time
    // anyway, and a spreadsheet must not be the one route that gets to try.
    learnerStatuses: new Map(
      ((statuses.data ?? []) as any[]).flatMap((r: any) => [
        [L(r.code), r.code as string],
        [L(r.label), r.code as string],
      ]),
    ),
  };
}
