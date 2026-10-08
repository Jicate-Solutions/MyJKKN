/**
 * GET   /api/hr/recruitment/candidates/<id>/salary-details
 * PATCH /api/hr/recruitment/candidates/<id>/salary-details
 *
 * The three inputs the suggested salary needs, on the candidate: the official
 * job title (hr_designations), the department, and the years of experience
 * before JKKN (migration 20271008200600). role_title is never touched.
 *
 * GET returns the current values and the choices: the job titles of the
 * candidate's HR organisation and the departments of their college. Both lists
 * are read with the caller's own session, so RLS decides what is offered. When
 * role_title is exactly an official job title (normalizeDesignationKey), its id
 * comes back as `roleTitleMatchId` so the picker can start on it.
 *
 * PATCH writes ONLY those three columns, and only after checking that the job
 * title belongs to the candidate's HR organisation and the department to the
 * candidate's college. withAuth asks for `hr.recruitment.edit`; the row's own
 * UPDATE policy (hr.recruitment.edit + role_has_institution_access) decides
 * again, and a write that reaches no row answers 403.
 *
 * No money is read or written here. allowApiKey: false — browser screen only.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { matchDesignationExact } from '@/lib/services/hr/designation-mapping';
import { getErrorMessage } from '@/lib/utils';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** numeric(4,1): up to 999.9. */
const MAX_YEARS = 999.9;

export interface CandidateSalaryDetails {
  designation_id: string | null;
  department_id: string | null;
  prior_experience_years: number | null;
}

interface CandidateRow extends CandidateSalaryDetails {
  id: string;
  role_title: string | null;
  institution_id: string | null;
  hr_organization_id: string | null;
}

type Supa = any;

async function readCandidate(supabase: Supa, id: string): Promise<CandidateRow | null> {
  const { data, error } = await supabase
    .from('hr_recruitment_candidates')
    .select('id, role_title, institution_id, hr_organization_id, designation_id, department_id, prior_experience_years')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const years = data.prior_experience_years;
  return { ...data, prior_experience_years: years === null || years === undefined ? null : Number(years) };
}

async function idOf(params: Promise<Record<string, string>> | undefined): Promise<string | null> {
  const id = (await params)?.id ?? '';
  return UUID.test(id) ? id : null;
}

const NOT_VISIBLE = 'Candidate not found, or not one you can see.';

export const GET = withAuth(
  async (_request, auth, context) => {
    await connection();
    const id = await idOf(context?.params);
    if (!id) return NextResponse.json({ error: 'This is not a candidate id.' }, { status: 400 });
    try {
      const candidate = await readCandidate(auth.supabase, id);
      if (!candidate) return NextResponse.json({ error: NOT_VISIBLE }, { status: 404 });

      const [designationsRes, departmentsRes] = await Promise.all([
        candidate.hr_organization_id
          ? auth.supabase
              .from('hr_designations')
              .select('id, name')
              .eq('hr_organization_id', candidate.hr_organization_id)
              .eq('is_active', true)
              .order('name', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        candidate.institution_id
          ? auth.supabase
              .from('departments')
              .select('id, department_name')
              .eq('institution_id', candidate.institution_id)
              .eq('is_active', true)
              .order('department_name', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (designationsRes.error) throw designationsRes.error;
      if (departmentsRes.error) throw departmentsRes.error;

      const designations = ((designationsRes.data ?? []) as Array<{ id: string; name: string }>).map((d) => ({
        id: d.id,
        name: d.name,
      }));
      const departments = ((departmentsRes.data ?? []) as Array<{ id: string; department_name: string }>).map(
        (d) => ({ id: d.id, name: d.department_name })
      );
      const match = matchDesignationExact(
        candidate.role_title,
        designations.map((d) => ({ ...d, cadre_id: null, cadre_name: null }))
      );

      return NextResponse.json({
        details: {
          designation_id: candidate.designation_id,
          department_id: candidate.department_id,
          prior_experience_years: candidate.prior_experience_years,
        },
        roleTitle: candidate.role_title,
        hasCollege: Boolean(candidate.institution_id),
        roleTitleMatchId: match?.id ?? null,
        designations,
        departments,
      });
    } catch (err: unknown) {
      console.error('[HR Candidate Salary Details] read error:', err);
      // PostgrestError is a plain object — getErrorMessage keeps its text.
      return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
    }
  },
  { requiredPermission: 'read', allowApiKey: false },
);

/** Validate the body: each field may be a value or null; anything else is refused. */
function parseBody(body: unknown): CandidateSalaryDetails | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'Send the three details.';
  const b = body as Record<string, unknown>;
  const designation = b.designation_id ?? null;
  const department = b.department_id ?? null;
  const years = b.prior_experience_years ?? null;
  if (designation !== null && (typeof designation !== 'string' || !UUID.test(designation))) {
    return 'The job title is not a valid choice.';
  }
  if (department !== null && (typeof department !== 'string' || !UUID.test(department))) {
    return 'The department is not a valid choice.';
  }
  if (years !== null && (typeof years !== 'number' || !Number.isFinite(years) || years < 0 || years > MAX_YEARS)) {
    return `Years of experience before JKKN must be a number from 0 to ${MAX_YEARS}, or left blank.`;
  }
  return {
    designation_id: designation as string | null,
    department_id: department as string | null,
    prior_experience_years: years === null ? null : Math.round((years as number) * 10) / 10,
  };
}

export const PATCH = withAuth(
  async (request, auth, context) => {
    await connection();
    const id = await idOf(context?.params);
    if (!id) return NextResponse.json({ error: 'This is not a candidate id.' }, { status: 400 });
    const parsed = parseBody(await request.json().catch(() => null));
    if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });

    try {
      const candidate = await readCandidate(auth.supabase, id);
      if (!candidate) return NextResponse.json({ error: NOT_VISIBLE }, { status: 404 });

      if (parsed.designation_id) {
        const { data, error } = await auth.supabase
          .from('hr_designations')
          .select('id')
          .eq('id', parsed.designation_id)
          .eq('hr_organization_id', candidate.hr_organization_id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            { error: "That job title is not one of this candidate's HR organisation." },
            { status: 400 }
          );
        }
      }
      if (parsed.department_id) {
        if (!candidate.institution_id) {
          return NextResponse.json(
            { error: 'This candidate has no college recorded, so no department can be picked.' },
            { status: 400 }
          );
        }
        const { data, error } = await auth.supabase
          .from('departments')
          .select('id')
          .eq('id', parsed.department_id)
          .eq('institution_id', candidate.institution_id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            { error: "That department is not one of this candidate's college." },
            { status: 400 }
          );
        }
      }

      const { data: updated, error } = await auth.supabase
        .from('hr_recruitment_candidates')
        .update({
          designation_id: parsed.designation_id,
          department_id: parsed.department_id,
          prior_experience_years: parsed.prior_experience_years,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!updated || updated.length !== 1) {
        return NextResponse.json({ error: 'You cannot edit this candidate.' }, { status: 403 });
      }
      return NextResponse.json({ details: parsed });
    } catch (err: unknown) {
      console.error('[HR Candidate Salary Details] save error:', err);
      return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
    }
  },
  { requirePermission: 'hr.recruitment.edit', requiredPermission: 'write', allowApiKey: false },
);
