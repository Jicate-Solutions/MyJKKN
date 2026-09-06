import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionId,
  resolveCoeInstitutionById,
} from '@/lib/utils/internal-marks/internal-marks-access';
import { resolveQpScope } from '@/lib/utils/question-papers/qp-scope';
import { istToday } from '@/types/internal-marks';
import type { PlannedScope } from '@/types/ia-question-paper';

/**
 * /api/question-papers/planned-scopes
 *
 * Returns the distinct (program, semester) scopes that have an ACTIVE staff_plans
 * row for a given academic year — so QP entry only offers subjects that have been
 * planned ("subject only visible for staff planning").
 *
 * staff_plans is MyJKKN-side and keyed by the MyJKKN institution UUID. For CAS
 * (SF + Aided share one COE institution) we expand to all sibling MyJKKN ids that
 * map to the same COE institution, so a CAS user sees the whole college's plan.
 * The resulting program_code (programs.program_id) + semester_number
 * (semesters.semester_order) drive the COE course_offerings generate call.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveInternalMarksAccess(user.id);
    const { searchParams } = new URL(request.url);
    const institutionId = resolveEffectiveInstitutionId(
      scope,
      searchParams.get('institutionId')
    );
    if (!institutionId) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 });
    }

    // CAS expansion: include every MyJKKN institution mapping to the same COE unit.
    let institutionIds = [institutionId];
    try {
      const coeId = await resolveCoeInstitutionId(institutionId);
      if (coeId) {
        const coeInst = await resolveCoeInstitutionById(coeId);
        if (coeInst?.myjkkn_institution_ids?.length) {
          institutionIds = coeInst.myjkkn_institution_ids;
        }
      }
    } catch {
      // Fall back to the single institution if COE resolution is unavailable.
    }

    // SIGNAL: staff plans that are ACTIVE and whose date window contains today.
    // Academic-year filtering is intentionally NOT applied — CAS splits one year
    // into TWO academic_year rows (Self + Aided) with the same name, so filtering
    // by a single academic_year_id drops half the college's plans. The active date
    // window already scopes to the current term across both CAS branches.
    const today = istToday();
    const { data: plans, error } = await supabase
      .from('staff_plans')
      .select('program_id, semester_id')
      .in('institution_id', institutionIds)
      .eq('is_active', true)
      .lte('start_date', today)
      .gte('end_date', today);

    if (error) {
      console.error('[question-papers/planned-scopes] staff_plans query error:', error);
      return NextResponse.json({ error: 'Failed to fetch planned scopes' }, { status: 500 });
    }

    const activePlans = plans ?? [];
    const programIds = [...new Set(activePlans.map((p: any) => p.program_id).filter(Boolean))];
    const semesterIds = [...new Set(activePlans.map((p: any) => p.semester_id).filter(Boolean))];

    console.log('[planned-scopes]', {
      institutionIds,
      today,
      active: activePlans.length,
      programIds: programIds.length,
      semesterIds: semesterIds.length,
    });

    if (activePlans.length === 0) return NextResponse.json({ data: [] });

    const [{ data: programs }, { data: semesters }] = await Promise.all([
      supabase.from('programs').select('id, program_id, program_name').in('id', programIds),
      supabase.from('semesters').select('id, semester_order, semester_name').in('id', semesterIds),
    ]);
    const progById = new Map((programs ?? []).map((p: any) => [p.id, p]));
    const semById = new Map((semesters ?? []).map((s: any) => [s.id, s]));

    const seen = new Set<string>();
    const scopes: PlannedScope[] = [];
    for (const plan of activePlans as any[]) {
      const program: any = progById.get(plan.program_id);
      const semester: any = semById.get(plan.semester_id);
      const program_code = program?.program_id;
      const semester_number = semester?.semester_order;
      if (!program_code || semester_number == null) continue;
      const key = `${program_code}:${semester_number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      scopes.push({
        program_code,
        program_name: program?.program_name ?? program_code,
        semester_number: Number(semester_number),
        semester_name: semester?.semester_name ?? `Semester ${semester_number}`,
      });
    }

    scopes.sort(
      (a, b) =>
        a.program_name.localeCompare(b.program_name) || a.semester_number - b.semester_number
    );

    // Restrict the Program dropdown to the user's OWN program(s) whenever they are
    // a staff member with plans (faculty, HOD, and teaching CoE staff alike). Only
    // a super_admin / admin with no staff plans sees every planned program.
    const qpScope = await resolveQpScope(supabase, user.id, scope.isSuperAdmin, scope.role);
    const visible =
      qpScope.programCodes.length > 0
        ? scopes.filter((s) => qpScope.programCodes.includes(s.program_code))
        : scopes;

    return NextResponse.json({ data: visible });
  } catch (error) {
    console.error('[question-papers/planned-scopes] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch planned scopes' }, { status: 500 });
  }
}
