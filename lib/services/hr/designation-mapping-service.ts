// lib/services/hr/designation-mapping-service.ts
// ============================================================================
// Data access for /hr/admin/designation-mapping.
//
// Writes the link that already exists — `hr_staff_details.designation_id` and
// `hr_staff_details.cadre_id` — never a new column on `staff`. Those two are
// the columns payroll reads (PR #2664) and `employee-service.ts` filters on.
//
// RLS does the tenant isolation. `hr_designations`, `hr_cadres` and
// `hr_staff_details` are all gated by
// `hr_organization_id = auth_hr_organization_id() OR is_super_admin()`, and
// `staff` SELECT needs `staff.view`. A caller outside that scope gets zero rows
// and no error — silence, not a refusal — so `loadWorkspace` reports which of
// the reads came back empty and the page says so in words.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { DesignationOption, StaffTitleInput } from './designation-mapping';

/** PostgREST caps a page at 1000 rows by default; the largest institution has ~156 staff. */
const STAFF_PAGE_LIMIT = 5000;

export interface HrOrganizationOption {
  id: string;
  name: string;
  institution_id: string | null;
}

export interface MappingWorkspace {
  staff: StaffTitleInput[];
  designations: DesignationOption[];
  /** staff_id -> the hr_organization_id its existing detail row belongs to. */
  detailOrgByStaffId: Map<string, string>;
}

/** Organisations this viewer can actually read. RLS decides the list. */
export async function listHrOrganizations(): Promise<HrOrganizationOption[]> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await (supabase as any)
    .from('hr_organizations')
    .select('id, name, institution_id')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as HrOrganizationOption[];
}

/**
 * Everything the screen needs for one organisation: its people, its
 * designations, and whichever links already exist.
 */
export async function loadWorkspace(org: HrOrganizationOption): Promise<MappingWorkspace> {
  const supabase = createClientSupabaseClient();

  const designationsPromise = (supabase as any)
    .from('hr_designations')
    .select('id, name, cadre_id, cadre:cadre_id ( id, name )')
    .eq('hr_organization_id', org.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  const staffQuery = (supabase as any)
    .from('staff')
    .select('id, designation')
    .range(0, STAFF_PAGE_LIMIT - 1)
    .order('id', { ascending: true });

  const [designationsRes, staffRes] = await Promise.all([
    designationsPromise,
    org.institution_id ? staffQuery.eq('institution_id', org.institution_id) : staffQuery,
  ]);

  if (designationsRes.error) throw designationsRes.error;
  if (staffRes.error) throw staffRes.error;

  const designations: DesignationOption[] = (designationsRes.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    cadre_id: row.cadre_id ?? null,
    cadre_name: row.cadre?.name ?? null,
  }));

  const staffRows: { id: string; designation: string | null }[] = staffRes.data ?? [];
  const staffIds = staffRows.map((s) => s.id);

  // Keyed by staff_id rather than by organisation on purpose: 4 detail rows in
  // production sit under an hr_organization whose institution differs from the
  // person's own `staff.institution_id`. Filtering by organisation would show
  // those four as unsorted when they are not.
  const detailByStaffId = new Map<string, { designation_id: string | null; org: string }>();
  if (staffIds.length > 0) {
    const { data: details, error: detailsError } = await (supabase as any)
      .from('hr_staff_details')
      .select('staff_id, designation_id, hr_organization_id')
      .in('staff_id', staffIds);
    if (detailsError) throw detailsError;
    for (const row of details ?? []) {
      detailByStaffId.set(row.staff_id, {
        designation_id: row.designation_id ?? null,
        org: row.hr_organization_id,
      });
    }
  }

  return {
    staff: staffRows.map((s) => ({
      id: s.id,
      designation: s.designation,
      designation_id: detailByStaffId.get(s.id)?.designation_id ?? null,
    })),
    designations,
    detailOrgByStaffId: new Map(
      [...detailByStaffId.entries()].map(([staffId, d]) => [staffId, d.org])
    ),
  };
}

export interface SaveTitleMappingInput {
  /** Every team member carrying this title — all case variants together. */
  staffIds: string[];
  designation: DesignationOption;
  /** Organisation to file a brand-new detail row under. */
  hrOrganizationId: string;
  /** Existing detail rows keep the organisation they already have. */
  detailOrgByStaffId: Map<string, string>;
}

/**
 * Sort one job title, and with it every team member who carries any spelling of
 * it. Writing `cadre_id` alongside `designation_id` keeps the pair consistent —
 * the same invariant the backfill migration asserts.
 */
export async function saveTitleMapping(input: SaveTitleMappingInput): Promise<number> {
  const { staffIds, designation, hrOrganizationId, detailOrgByStaffId } = input;
  if (staffIds.length === 0) return 0;

  const supabase = createClientSupabaseClient();
  const rows = staffIds.map((staffId) => ({
    staff_id: staffId,
    hr_organization_id: detailOrgByStaffId.get(staffId) ?? hrOrganizationId,
    designation_id: designation.id,
    cadre_id: designation.cadre_id,
  }));

  const { error } = await (supabase as any)
    .from('hr_staff_details')
    .upsert(rows, { onConflict: 'staff_id' });
  if (error) throw error;
  return rows.length;
}
