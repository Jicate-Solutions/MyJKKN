export const dynamic = 'force-dynamic';

// ============================================
// INCOMPLETE PROFILES — YEAR FILTER OPTIONS API
// ============================================
// Created: 2026-07-30
// Purpose: Academic-year / admission-year dropdown options for the Profile
//          Completion drill-down filter bar.
// Used by: Profile Completion Tab -> IncompleteProfilesTable filter bar
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveInstitutionScope } from '@/lib/auth/institution-scope';

/** Hard cap per list so a super admin querying every institution stays bounded. */
const MAX_OPTIONS = 500;

interface FilterOption {
  value: string;
  label: string;
}

/**
 * GET /api/learners/analytics/incomplete-profiles/options
 *
 * Only the two YEAR lists live here. The organisational levels
 * (institution > department > program > semester > section) are cascading and
 * come from the existing org services on the client, the same way
 * /learners/profiles builds its Advanced Filters panel.
 *
 * The years are deliberately NOT cascaded off the institution picker: they must
 * stay usable while the scope is "All institutions", which is the default for
 * anyone who can see more than one.
 *
 * Query Parameters:
 * - institutionIds: comma-separated institution IDs (defaults to the caller's)
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const institutionIdsParam = request.nextUrl.searchParams.get('institutionIds');
    const explicitIds = institutionIdsParam
      ? institutionIdsParam.split(',').filter(Boolean)
      : [];
    const institutionIds = resolveInstitutionScope(profile, explicitIds) ?? [];

    // With no institution at all (a super admin viewing "all institutions") the
    // queries run unscoped and RLS decides what comes back.
    const scope = <T>(query: T): T =>
      institutionIds.length > 0
        ? ((query as any).in('institution_id', institutionIds) as T)
        : query;

    const [academicYearsRes, admissionYearsRes] = await Promise.all([
      scope(
        supabase
          .from('academic_years')
          .select('id, academic_year_name, institution:institutions(name)')
          .order('academic_year_name', { ascending: false })
          .limit(MAX_OPTIONS)
      ),
      scope(
        supabase
          .from('admission_years')
          .select('id, admission_year_name, year, institution:institutions(name)')
          .order('year', { ascending: false })
          .limit(MAX_OPTIONS)
      ),
    ]);

    const firstError = academicYearsRes.error || admissionYearsRes.error;

    if (firstError) {
      console.error(
        '[api/learners/analytics/incomplete-profiles/options] Query error:',
        firstError
      );
      return NextResponse.json(
        { error: 'Failed to fetch filter options', details: firstError.message },
        { status: 500 }
      );
    }

    // Every institution has its own "2024-2025" row with its own id. When more
    // than one institution is in scope the bare name would appear repeatedly
    // and each entry would silently filter to just one college — so qualify the
    // label with the institution instead of deduping (deduping would drop real,
    // separately-filterable years).
    const qualify = institutionIds.length !== 1;
    const label = (name: string, row: any) =>
      qualify && row.institution?.name ? `${name} — ${row.institution.name}` : name;

    const academicYears: FilterOption[] = (academicYearsRes.data || [])
      .map((row: any) => ({
        value: row.id,
        label: label(row.academic_year_name, row),
      }))
      .filter((option: FilterOption) => Boolean(option.label));

    const admissionYears: FilterOption[] = (admissionYearsRes.data || [])
      .map((row: any) => ({
        value: row.id,
        label: label(row.admission_year_name || String(row.year ?? ''), row),
      }))
      .filter((option: FilterOption) => Boolean(option.label));

    return NextResponse.json(
      { academicYears, admissionYears },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[api/learners/analytics/incomplete-profiles/options] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch filter options',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
