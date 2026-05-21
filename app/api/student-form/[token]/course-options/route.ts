// app/api/student-form/[token]/course-options/route.ts
//
// PUBLIC — no auth. Token validates the request. Returns the slice of
// cascading dropdown data the Course Selection wizard step needs.
//
// Single POST endpoint with a `kind` discriminator (instead of 5 separate
// routes) so the client makes one cascading sequence:
//   { kind: 'institutions' } -> array
//   { kind: 'degrees',      filters: { institution_id } } -> array
//   { kind: 'programs',     filters: { degree_id } } -> array
//   { kind: 'semesters',    filters: { program_id } } -> array
//   { kind: 'department',   filters: { program_id } } -> single row (for auto-fill lookup)
//
// Why service-role + no RLS: the student-form runs without a logged-in
// session, only the HMAC token authorizes the request. RLS on these tables
// is keyed off authenticated users; service-role bypasses it. The token
// validation above is the only gate, and it's plenty — these are reference
// tables (institutions, programs, etc.), not sensitive PII.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';

type Filters = {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
};

type Kind =
  | 'institutions'
  | 'degrees'
  | 'programs'
  | 'semesters'
  | 'department'
  | 'admission_year'
  | 'names';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // Validate token first — anything else is wasted work if the token is bad
  try {
    await StudentFormService.validateToken(decodeURIComponent(token));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid';
    if (['malformed_token', 'bad_signature', 'bad_payload', 'token_not_found', 'token_id_mismatch'].includes(msg)) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }
    if (['expired', 'consumed', 'superseded'].includes(msg)) {
      return NextResponse.json({ error: msg }, { status: 410 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  let body: { kind: Kind; filters?: Filters };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  const filters = body.filters ?? {};

  try {
    switch (body.kind) {
      case 'institutions': {
        const { data, error } = await (svc as any)
          .from('institutions')
          .select('id, name, counselling_code')
          .order('name', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }

      case 'degrees': {
        if (!filters.institution_id) {
          return NextResponse.json({ data: [] });
        }
        const { data, error } = await (svc as any)
          .from('degrees')
          .select('id, degree_name, degree_id, institution_id')
          .eq('institution_id', filters.institution_id)
          .order('degree_name', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }

      case 'programs': {
        // Programs are filtered by degree (skipping the Department step in
        // the student wizard). The picked program's department_id is then
        // used to auto-fill the Department field client-side.
        //
        // 2026-05-21: also embed `department.department_code` so the
        // client can apply the engineering-first-year rule (department_code='SH'
        // is the Science & Humanities mirror dept that all first-year
        // engineering students enrol under). Client filters to those rows
        // when entry_type='FIRST YEAR' AND the institution has an SH dept.
        if (!filters.degree_id) {
          return NextResponse.json({ data: [] });
        }
        const { data: rows, error } = await (svc as any)
          .from('programs')
          .select(
            'id, program_name, department_id, degree_id, institution_id, department:departments(department_code)',
          )
          .eq('degree_id', filters.degree_id)
          .order('program_name', { ascending: true });
        if (error) throw error;
        // Flatten the embed so the client sees a plain `department_code`
        // string. The embed returns `{ department_code: 'SH' }` or null.
        const data = (rows ?? []).map((r: any) => ({
          ...r,
          department_code: r.department?.department_code ?? null,
        }));
        return NextResponse.json({ data });
      }

      case 'semesters': {
        if (!filters.program_id) {
          return NextResponse.json({ data: [] });
        }
        const { data, error } = await (svc as any)
          .from('semesters')
          .select('id, semester_name, semester_code, semester_order, initial_semester, terminal_semester, program_id')
          .eq('program_id', filters.program_id)
          .eq('is_active', true)
          .order('semester_order', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }

      case 'department': {
        // Lookup the department row for a given program_id. Used by the
        // wizard to display the auto-derived department name as read-only.
        if (!filters.program_id) {
          return NextResponse.json({ data: null });
        }
        const { data: programRow, error: pErr } = await (svc as any)
          .from('programs')
          .select('department_id')
          .eq('id', filters.program_id)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!programRow?.department_id) {
          return NextResponse.json({ data: null });
        }
        const { data: deptRow, error: dErr } = await (svc as any)
          .from('departments')
          .select('id, department_name')
          .eq('id', programRow.department_id)
          .maybeSingle();
        if (dErr) throw dErr;
        return NextResponse.json({ data: deptRow ?? null });
      }

      case 'admission_year': {
        // Auto-fetch the admission_year row for the current calendar year
        // scoped to the learner's (institution, program). Used by the
        // student-form's Course Selection step to render a READ-ONLY
        // Admission Year field — the student can't edit it, but the value
        // is saved with the form so the fee-structure matrix lookup picks
        // up the right cohort. Returns null when no row matches (admin
        // hasn't configured this institution+program for the current
        // year yet).
        if (!filters.institution_id || !filters.program_id) {
          return NextResponse.json({ data: null });
        }
        const currentYear = new Date().getFullYear();
        const { data, error } = await (svc as any)
          .from('admission_years')
          .select('id, admission_year_name, program_start_year, program_end_year')
          .eq('institution_id', filters.institution_id)
          .eq('program_id', filters.program_id)
          .eq('program_start_year', currentYear)
          .eq('is_active', true)
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ data: data ?? null });
      }

      case 'names': {
        // Batch resolve display names for the IDs the learner has saved.
        // Used by the preview step to render Institution / Degree / Department
        // / Program / Semester labels without N separate round-trips.
        const out: {
          institution?: string;
          degree?: string;
          department?: string;
          program?: string;
          semester?: string;
        } = {};
        const ops: Array<Promise<unknown>> = [];

        if (filters.institution_id) {
          ops.push(
            (svc as any)
              .from('institutions')
              .select('name')
              .eq('id', filters.institution_id)
              .maybeSingle()
              .then(({ data }: any) => {
                if (data?.name) out.institution = data.name;
              }),
          );
        }
        if (filters.degree_id) {
          ops.push(
            (svc as any)
              .from('degrees')
              .select('degree_name')
              .eq('id', filters.degree_id)
              .maybeSingle()
              .then(({ data }: any) => {
                if (data?.degree_name) out.degree = data.degree_name;
              }),
          );
        }
        if (filters.department_id) {
          ops.push(
            (svc as any)
              .from('departments')
              .select('department_name')
              .eq('id', filters.department_id)
              .maybeSingle()
              .then(({ data }: any) => {
                if (data?.department_name) out.department = data.department_name;
              }),
          );
        }
        if (filters.program_id) {
          ops.push(
            (svc as any)
              .from('programs')
              .select('program_name')
              .eq('id', filters.program_id)
              .maybeSingle()
              .then(({ data }: any) => {
                if (data?.program_name) out.program = data.program_name;
              }),
          );
        }
        if (filters.semester_id) {
          ops.push(
            (svc as any)
              .from('semesters')
              .select('semester_name')
              .eq('id', filters.semester_id)
              .maybeSingle()
              .then(({ data }: any) => {
                if (data?.semester_name) out.semester = data.semester_name;
              }),
          );
        }
        await Promise.all(ops);
        return NextResponse.json({ data: out });
      }

      default:
        return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
    }
  } catch (e) {
    console.error('[student-form/course-options]', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
