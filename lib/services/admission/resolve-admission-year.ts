// lib/services/admission/resolve-admission-year.ts
//
// Translate a legacy (year, institution_id) pair into the UUID of the matching
// admission_years row. Used by Excel bulk importers and any other code path
// that carries the legacy integer year and needs to populate the new
// admission_year_id FK alongside it.
//
// Created 2026-04-23 as part of PR-4 of the admission-year unification plan.
// Updated 2026-06-05 — admission_years is now institution-wide; the per-program
// dimension was dropped, so resolution keys on institution only.
//
// Matching rule:
//   1. institution_id == instId
//   2. Prefer year = year (exact) regardless of is_active flag — historical
//      cohorts are catalogued with is_active=false but must still match for
//      legacy data imports.
//   3. If no exact match, fall back to the latest is_active=true cohort for
//      that institution — matching the "admitted rows default to latest active
//      cohort" semantic.
//
// Returns null when nothing matches — callers write null into admission_year_id,
// the legacy integer stays populated as-is, and the row is surfaced by the
// audit script in scripts/audit-admission-year-backfill.ts.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolveAdmissionYearArgs {
  year: number | null | undefined;
  institutionId: string | null | undefined;
}

export async function resolveAdmissionYearId(
  supabase: SupabaseClient,
  { year, institutionId }: ResolveAdmissionYearArgs
): Promise<string | null> {
  if (!institutionId) return null;

  // Fetch ALL cohorts for the institution so we can match historical
  // (is_active=false) years exactly while still defaulting to the latest
  // active cohort.
  const { data, error } = await (supabase as any)
    .from('admission_years')
    .select('id, year, is_active')
    .eq('institution_id', institutionId)
    .order('year', { ascending: false });

  if (error || !data || data.length === 0) return null;

  if (typeof year === 'number') {
    const exact = data.find((row: any) => row.year === year);
    if (exact) return exact.id;
  }

  const latestActive = data.find((row: any) => row.is_active === true);
  return latestActive?.id ?? null;
}

/**
 * Bulk resolver — accepts an array of (year, institution) pairs and returns a
 * Map keyed by the same pair. One DB query per distinct institution to keep
 * Excel imports of 3000+ rows from doing 3000 round-trips.
 */
export async function resolveAdmissionYearIdBulk(
  supabase: SupabaseClient,
  rows: ResolveAdmissionYearArgs[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  // Group by institution_id; one query per distinct institution.
  const institutions = new Set<string>();
  for (const r of rows) {
    if (r.institutionId) institutions.add(r.institutionId);
  }

  // Fetch admission_years rows for each distinct institution (active + inactive,
  // mirroring the single-row helper so historical cohorts match).
  const instResults = new Map<
    string,
    Array<{ id: string; year: number; is_active: boolean }>
  >();
  for (const instId of institutions) {
    const { data } = await (supabase as any)
      .from('admission_years')
      .select('id, year, is_active')
      .eq('institution_id', instId)
      .order('year', { ascending: false });
    instResults.set(
      instId,
      (data ?? []) as Array<{ id: string; year: number; is_active: boolean }>
    );
  }

  // Resolve each input row.
  for (const r of rows) {
    const key = `${r.year ?? ''}::${r.institutionId ?? ''}`;
    if (!r.institutionId) {
      result.set(key, null);
      continue;
    }
    const rowsForInst = instResults.get(r.institutionId) ?? [];
    if (rowsForInst.length === 0) {
      result.set(key, null);
      continue;
    }
    if (typeof r.year === 'number') {
      const exact = rowsForInst.find((row) => row.year === r.year);
      if (exact) {
        result.set(key, exact.id);
        continue;
      }
    }
    const latestActive = rowsForInst.find((row) => row.is_active === true);
    result.set(key, latestActive?.id ?? null);
  }

  return result;
}
