export const dynamic = 'force-dynamic';

// app/api/cdc/pickers/semesters/route.ts
// GET /api/cdc/pickers/semesters?department_id=<uuid>
//
// Option source for the CDC training "Add semester" dialog so coordinators pick
// a real semester label from the target department instead of free-typing one.
//
// WHY service-role: same RLS gap as the staff / learners pickers — a CDC
// coordinator holds cdc.* but NOT organization/academic perms, so the browser
// (anon/RLS) client returns 0 rows from `semesters` and the picker looks empty.
// This route reads via the service-role client to bypass that gap, then
// re-imposes the SAME institution scope every other CDC picker route uses
// (applyInstitutionFilterToQuery). super_admin / admission keep their
// cross-institution bypass (institutionIds: []); everyone else only ever sees
// their own institutions' semesters — no cross-tenant leak.
//
// The academic `semesters` master is program-scoped and its `semester_name`
// values are inconsistent ("Semester 1", "semester 1", "1 Year", trailing
// spaces). A CDC training programme targets a DEPARTMENT (which spans several
// programs), so we filter by department_id when supplied and DEDUPE distinct
// trimmed semester_name (case-insensitive), ordered by semester_order — the
// cleaned label is what gets stored in cdc_training_semester_schedules.semester_label.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

interface SemesterRow {
  semester_name: string | null;
  semester_order: number | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Step 1: Session auth — must be a logged-in user.
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Resolve caller's institution scope (super_admin/admission bypass
  // preserved — they return institutionIds: [] meaning "all").
  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason || 'Institution access denied' },
      { status: 403 }
    );
  }

  const departmentId = request.nextUrl.searchParams.get('department_id');

  try {
    // Step 3: Service-role read (bypasses semesters RLS) ...
    const supabase = createServiceRoleClient();
    let query = supabase
      .from('semesters')
      .select('semester_name, semester_order')
      .eq('is_active', true)
      .order('semester_order', { ascending: true })
      .limit(2000);

    // Scope to the training's target department when provided. When the
    // programme targets "all departments" (no id), fall back to the caller's
    // institution-wide distinct semesters so the field is never empty.
    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    // Step 4: ... then re-impose institution scope (NEVER cross-tenant).
    query = applyInstitutionFilterToQuery(query, filter);

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/pickers/semesters] query failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to load semesters' },
        { status: 500 }
      );
    }

    // Dedupe distinct trimmed semester_name (case-insensitive), keep the lowest
    // semester_order for stable academic ordering. Empty / whitespace-only
    // names (dirty master rows) are dropped.
    const seen = new Map<string, { label: string; order: number }>();
    for (const r of (data ?? []) as SemesterRow[]) {
      const label = (r.semester_name ?? '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const order = r.semester_order ?? 9999;
      const existing = seen.get(key);
      if (!existing || order < existing.order) {
        seen.set(key, { label, order });
      }
    }

    const options = Array.from(seen.values())
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .map((s) => ({ value: s.label, label: s.label }));

    return NextResponse.json(
      { options },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/pickers/semesters] error:', err);
    return NextResponse.json(
      { error: 'Failed to load semesters' },
      { status: 500 }
    );
  }
}
