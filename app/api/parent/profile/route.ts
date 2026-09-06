import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveParentScope,
  assertLearnerAccess,
  parentErrorResponse,
} from '@/lib/utils/parent-access';
import {
  resolveProgramNames,
  resolveSectionNames,
  resolveDepartmentNames,
} from '@/lib/services/parent/parent-lookup';
import { admissionNumber, fullName, type MatchedLearner } from '@/lib/utils/parent-identifier';
import type { ParentProfileResponse } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** Format a stored date (YYYY-MM-DD or ISO) as DD-MM-YYYY; passthrough if unparseable. */
function formatDob(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const m = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
}

/** GET /api/parent/profile?learnerId=… — learner + parent detail tabs. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId); // 403 if not this parent's child

    const db = createServiceRoleClient();
    const { data: lRow, error } = await db
      .from('learners_profiles')
      .select(
        'id, application_id, roll_number, register_number, first_name, last_name, ' +
          'date_of_birth, gender, student_photo_url, student_email, college_email, ' +
          'father_name, mother_name, father_mobile, mother_mobile, ' +
          'program_id, section_id, department_id, ' +
          'permanent_address_street, permanent_address_district, permanent_address_state'
      )
      .eq('id', learnerId)
      .maybeSingle();

    const l = lRow as unknown as MatchedLearner | null;
    if (error || !l) {
      return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    }

    const [programs, sections, departments] = await Promise.all([
      resolveProgramNames(db, [l.program_id]),
      resolveSectionNames(db, [l.section_id]),
      resolveDepartmentNames(db, [l.department_id]),
    ]);

    const address = [
      l.permanent_address_street,
      l.permanent_address_district,
      l.permanent_address_state,
    ]
      .filter(Boolean)
      .join(', ');

    const body: ParentProfileResponse = {
      learner: {
        admissionNumber: admissionNumber(l),
        fullName: fullName(l),
        dateOfBirth: formatDob(l.date_of_birth),
        gender: l.gender ?? undefined,
        className: l.program_id ? programs.get(l.program_id) : undefined,
        sectionName: l.section_id ? sections.get(l.section_id) : undefined,
        branch: l.department_id ? departments.get(l.department_id) : undefined,
        address: address || undefined,
        photoUrl: l.student_photo_url ?? undefined,
      },
      parents: {
        fatherName: l.father_name ?? undefined,
        motherName: l.mother_name ?? undefined,
        primaryMobile: l.father_mobile ?? undefined,
        secondaryMobile: l.mother_mobile ?? undefined,
        email: l.student_email ?? l.college_email ?? undefined,
      },
    };

    return NextResponse.json(body);
  } catch (err) {
    return parentErrorResponse(err);
  }
}
