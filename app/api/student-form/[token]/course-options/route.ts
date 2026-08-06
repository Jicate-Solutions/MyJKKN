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
  quota_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  route_id?: string;
  stop_id?: string;
  district?: string;
  search?: string;
  pincode?: string;
};

type Kind =
  | 'institutions'
  | 'quotas'
  | 'degrees'
  | 'programs'
  | 'semesters'
  | 'sections'
  | 'department'
  | 'admission_year'
  | 'academic_year'
  | 'routes'
  | 'route_stops'
  | 'school_districts'
  | 'schools'
  | 'postal_lookup'
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
        // 2026-05-21: filter to entity_type='institution' so only the
        // student-admitting bodies appear in the QR form picker. The
        // institutions table also stores 'company' (Jicate Solutions,
        // Nattraja Incubation) and 'admin_office' (JKKN Main Office)
        // rows that have no programmes/degrees and don't admit students.
        // Also honour is_active to hide retired institutions.
        const { data, error } = await (svc as any)
          .from('institutions')
          .select('id, name, counselling_code')
          .eq('entity_type', 'institution')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }

      case 'quotas': {
        // Global admission quotas (not institution-scoped). The student picks
        // one; the form stores quota_id (FK) directly — no free text.
        const { data, error } = await (svc as any)
          .from('quotas')
          .select('id, name')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
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

      case 'sections': {
        // Sections under one semester. Added 2026-07-27 so the wizard can
        // resolve section "A" of the initial semester for FIRST YEAR admits.
        // The student never picks from this list — the client matches 'A' and
        // renders it read-only — but returning the full set keeps the endpoint
        // shaped like the other cascading kinds.
        if (!filters.semester_id) {
          return NextResponse.json({ data: [] });
        }
        const { data, error } = await (svc as any)
          .from('sections')
          .select('id, section_name, semester_id')
          .eq('semester_id', filters.semester_id)
          .eq('is_active', true)
          .order('section_name', { ascending: true });
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
          .select('id, admission_year_name, year')
          .eq('institution_id', filters.institution_id)
          .eq('year', currentYear)
          .eq('is_active', true)
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ data: data ?? null });
      }

      case 'academic_year': {
        // Auto-resolve the institution's CURRENT academic year for the
        // student-form's read-only Academic Year field (2026-07-27). Mirrors
        // the admission_year case above: locked in the UI, but submitted with
        // the course section so the learner lands in the right cohort.
        //
        // The filter is is_active AND today inside [start_date, end_date] —
        // NOT is_active alone. academic_years has no is_current flag (unlike
        // admission_years), and institutions keep several rows flagged active
        // at once: at the time of writing, 38 of 42 rows are is_active across
        // 12 institutions, so is_active alone matches ~3 rows per institution
        // and maybeSingle() would fail. Adding the date window narrows it to
        // exactly one row for every institution.
        if (!filters.institution_id) {
          return NextResponse.json({ data: null });
        }
        const { data, error } = await (svc as any)
          .from('academic_years')
          .select('id, academic_year_name, start_date, end_date')
          .eq('institution_id', filters.institution_id)
          .eq('is_active', true)
          .lte('start_date', new Date().toISOString().slice(0, 10))
          .gte('end_date', new Date().toISOString().slice(0, 10))
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ data: data ?? null });
      }

      case 'routes': {
        // Active TMS routes for the Day-Scholar "bus required" flow.
        const { data, error } = await (svc as any)
          .from('tms_route')
          .select('id, route_number, route_name, fare')
          .eq('status', 'active')
          .order('route_number', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }

      case 'route_stops': {
        // Boarding-point stops for the chosen route, ordered along the route.
        if (!filters.route_id) {
          return NextResponse.json({ data: [] });
        }
        const { data, error } = await (svc as any)
          .from('tms_route_stop')
          .select('id, stop_name, sequence_order')
          .eq('route_id', filters.route_id)
          .order('sequence_order', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }

      case 'school_districts': {
        // Districts that have active State Board schools — drives the Last
        // School cascade's District dropdown in the academic step.
        const { data, error } = await (svc as any).rpc('fn_school_master_districts', {
          p_board: 'state_board',
        });
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }

      case 'schools': {
        // State Board schools for one district, server-side searched (trigram
        // ILIKE). Mirrors SchoolMasterService.getSchools for the public form.
        if (!filters.district) {
          return NextResponse.json({ data: [], total: 0 });
        }
        let q = (svc as any)
          .from('school_master')
          .select('id, school_name, district', { count: 'exact' })
          .eq('board', 'state_board')
          .eq('district', filters.district)
          .eq('is_active', true)
          .order('school_name', { ascending: true })
          .limit(50);
        if (filters.search?.trim()) {
          const term = filters.search.trim().replace(/[%_]/g, '\\$&');
          q = q.ilike('school_name', `%${term}%`);
        }
        const { data, error, count } = await q;
        if (error) throw error;
        return NextResponse.json({ data: data ?? [], total: count ?? 0 });
      }

      case 'postal_lookup': {
        // Post offices for a 6-digit pincode — powers the address section's
        // district auto-fill + optional post-office pick. Mirrors
        // PostalCodeService.lookupPincode for the public form.
        const pin = (filters.pincode ?? '').trim();
        if (!/^[0-9]{6}$/.test(pin)) {
          return NextResponse.json({ data: { offices: [], districts: [] } });
        }
        const { data, error } = await (svc as any)
          .from('postal_codes')
          .select('*')
          .eq('pincode', pin)
          .eq('is_active', true)
          .order('office_name', { ascending: true });
        if (error) throw error;
        const offices = data ?? [];
        const districts = [
          ...new Map(offices.map((o: any) => [o.district_id, o])).values(),
        ].map((o: any) => ({ district: o.district, district_id: o.district_id }));
        return NextResponse.json({ data: { offices, districts } });
      }

      case 'names': {
        // Batch resolve display names for the IDs the learner has saved.
        // Used by the preview step to render Institution / Degree / Department
        // / Program / Semester labels without N separate round-trips.
        const out: {
          institution?: string;
          quota?: string;
          degree?: string;
          department?: string;
          program?: string;
          semester?: string;
          route?: string;
          stop?: string;
        } = {};
        const ops: Array<Promise<unknown>> = [];

        if (filters.quota_id) {
          ops.push(
            (svc as any)
              .from('quotas')
              .select('name')
              .eq('id', filters.quota_id)
              .maybeSingle()
              .then(({ data }: any) => {
                if (data?.name) out.quota = data.name;
              }),
          );
        }

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
        if (filters.route_id) {
          ops.push(
            (svc as any)
              .from('tms_route')
              .select('route_number, route_name')
              .eq('id', filters.route_id)
              .maybeSingle()
              .then(({ data }: any) => {
                if (data) out.route = `${data.route_number} - ${data.route_name}`;
              }),
          );
        }
        if (filters.stop_id) {
          ops.push(
            (svc as any)
              .from('tms_route_stop')
              .select('stop_name')
              .eq('id', filters.stop_id)
              .maybeSingle()
              .then(({ data }: any) => {
                if (data?.stop_name) out.stop = data.stop_name;
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
