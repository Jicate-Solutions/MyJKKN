// lib/services/admission/resolve-admission-year.ts
//
// Translate a legacy (year, institution_id, program_id) triple into the UUID
// of the matching admission_years row. Used by Excel bulk importers and any
// other code path that carries the legacy integer year and needs to populate
// the new admission_year_id FK alongside it.
//
// Created 2026-04-23 as part of PR-4 of the admission-year unification plan.
//
// Matching rule:
//   1. institution_id == instId
//   2. program_id == programId
//   3. Prefer program_start_year = year (exact) regardless of is_active flag —
//      historical cohorts (Phase A 2026-05-02 backfill) are catalogued with
//      is_active=false but must still match for legacy data imports.
//   4. If no exact match, fall back to the latest is_active=true cohort for
//      that (institution, program) — matching the PR-1 "admitted rows default
//      to latest active cohort" semantic.
//
// Returns null when nothing matches — callers write null into admission_year_id,
// the legacy integer stays populated as-is, and the row is surfaced by the
// audit script in scripts/audit-admission-year-backfill.ts.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolveAdmissionYearArgs {
  year: number | null | undefined;
  institutionId: string | null | undefined;
  programId: string | null | undefined;
}

export async function resolveAdmissionYearId(
  supabase: SupabaseClient,
  { year, institutionId, programId }: ResolveAdmissionYearArgs
): Promise<string | null> {
  if (!institutionId || !programId) return null;

  // Fetch ALL cohorts for the pair so we can match historical (is_active=false)
  // years exactly while still defaulting to the latest active cohort.
  const { data, error } = await (supabase as any)
    .from('admission_years')
    .select('id, program_start_year, is_active')
    .eq('institution_id', institutionId)
    .eq('program_id', programId)
    .order('program_start_year', { ascending: false });

  if (error || !data || data.length === 0) return null;

  if (typeof year === 'number') {
    const exact = data.find((row: any) => row.program_start_year === year);
    if (exact) return exact.id;
  }

  const latestActive = data.find((row: any) => row.is_active === true);
  return latestActive?.id ?? null;
}

/**
 * Bulk resolver — accepts an array of (year, institution, program) triples
 * and returns a Map keyed by the same triple. One DB query per distinct
 * (institution, program) combination to keep Excel imports of 3000+ rows
 * from doing 3000 round-trips.
 */
export async function resolveAdmissionYearIdBulk(
  supabase: SupabaseClient,
  rows: ResolveAdmissionYearArgs[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  // Group by (institution_id, program_id); one query per distinct pair.
  const pairs = new Map<string, { instId: string; progId: string }>();
  for (const r of rows) {
    if (r.institutionId && r.programId) {
      const key = `${r.institutionId}::${r.programId}`;
      if (!pairs.has(key)) {
        pairs.set(key, { instId: r.institutionId, progId: r.programId });
      }
    }
  }

  // Fetch admission_years rows for each distinct pair (active + inactive,
  // mirroring the single-row helper so historical cohorts match).
  const pairResults = new Map<
    string,
    Array<{ id: string; program_start_year: number; is_active: boolean }>
  >();
  for (const [key, { instId, progId }] of pairs) {
    const { data } = await (supabase as any)
      .from('admission_years')
      .select('id, program_start_year, is_active')
      .eq('institution_id', instId)
      .eq('program_id', progId)
      .order('program_start_year', { ascending: false });
    pairResults.set(
      key,
      (data ?? []) as Array<{ id: string; program_start_year: number; is_active: boolean }>
    );
  }

  // Resolve each input row.
  for (const r of rows) {
    const triple = `${r.year ?? ''}::${r.institutionId ?? ''}::${r.programId ?? ''}`;
    if (!r.institutionId || !r.programId) {
      result.set(triple, null);
      continue;
    }
    const rowsForPair = pairResults.get(`${r.institutionId}::${r.programId}`) ?? [];
    if (rowsForPair.length === 0) {
      result.set(triple, null);
      continue;
    }
    if (typeof r.year === 'number') {
      const exact = rowsForPair.find((row) => row.program_start_year === r.year);
      if (exact) {
        result.set(triple, exact.id);
        continue;
      }
    }
    const latestActive = rowsForPair.find((row) => row.is_active === true);
    result.set(triple, latestActive?.id ?? null);
  }

  return result;
}
