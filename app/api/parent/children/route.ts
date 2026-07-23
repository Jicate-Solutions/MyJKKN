import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, parentErrorResponse } from '@/lib/utils/parent-access';
import {
  resolveInstitutions,
  resolveProgramNames,
  resolveSectionNames,
} from '@/lib/services/parent/parent-lookup';
import { admissionNumber, fullName, type MatchedLearner } from '@/lib/utils/parent-identifier';
import type { ParentChild } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** GET /api/parent/children — the family (logged-in student + live siblings). */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // The parent_session cookie is HttpOnly, so the client learns its own
    // identity from here (alongside the children list) on a fresh page load.
    // Contact is LIVE from learners_profiles (resolved in resolveParentScope).
    const parent = {
      parentAccountId: scope.parentAccountId,
      mobile: scope.mobile,
      displayName: scope.displayName,
    };

    if (!scope.learnerIds.length) return NextResponse.json({ parent, data: [] });

    const db = createServiceRoleClient();

    const { data: learners } = await db
      .from('learners_profiles')
      .select(
        'id, institution_id, application_id, roll_number, register_number, ' +
          'first_name, last_name, student_photo_url, program_id, section_id'
      )
      .in('id', scope.learnerIds);

    const rows = (learners ?? []) as unknown as MatchedLearner[];
    const [institutions, programs, sections] = await Promise.all([
      resolveInstitutions(db, rows.map((r) => r.institution_id)),
      resolveProgramNames(db, rows.map((r) => r.program_id)),
      resolveSectionNames(db, rows.map((r) => r.section_id)),
    ]);

    const data: ParentChild[] = rows.map((r) => {
      const inst = r.institution_id ? institutions.get(r.institution_id) : undefined;
      return {
        learnerProfileId: r.id,
        institutionsId: r.institution_id ?? '',
        institutionName: inst?.name ?? '',
        entityType: inst?.entityType ?? 'institution',
        admissionNumber: admissionNumber(r),
        fullName: fullName(r),
        photoUrl: r.student_photo_url ?? undefined,
        institutionLogoUrl: inst?.logoUrl,
        className: r.program_id ? programs.get(r.program_id) : undefined,
        sectionName: r.section_id ? sections.get(r.section_id) : undefined,
        relationship: 'guardian',
        // The logged-in student shows first in the switcher.
        isPrimary: r.id === scope.loggedInLearnerId,
      };
    });

    data.sort((a, b) =>
      a.isPrimary === b.isPrimary
        ? a.fullName.localeCompare(b.fullName)
        : a.isPrimary
        ? -1
        : 1
    );

    return NextResponse.json({ parent, data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
