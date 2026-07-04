// app/api/schools-network/school-learners/route.ts
// ============================================================================
// GET /api/schools-network/school-learners?school=<name>&level=<ug|pg>
//   → the learner roster for ONE feeder school/college.
//
// Backed by fn_schools_network_school_learners (SECURITY DEFINER). Canonical
// name key is IDENTICAL to fn_schools_network_feeders v3.4, so the roster
// length equals the panel's enrolled_count for org-wide viewers.
//
// PII NOTE: unlike the aggregate feeder fn (org-wide by Director ruling, names
// + counts only), this returns learner PII and is therefore tenant-scoped
// inside the fn via role_has_institution_access() — super_admin / admin /
// scope='all' see every institution's learners; scope='own' coordinators see
// only their own slice. Route access is bounded by schools_network.schools.view
// (the same permission that gates the panel).
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const { searchParams } = new URL(request.url);
    const school = searchParams.get('school');
    if (!school || !school.trim()) {
      return errorResponse('school is required', 400, 'VALIDATION_ERROR');
    }
    // level: 'ug' | 'pg' filter by the JKKN program level the learner joined;
    // anything else → all levels.
    const levelParam = searchParams.get('level');
    const level = levelParam === 'ug' || levelParam === 'pg' ? levelParam : null;

    const { data, error } = await auth.supabase.rpc(
      'fn_schools_network_school_learners',
      { p_school_name: school, p_degree_type: level }
    );
    if (error) return errorResponse(error.message, 500, 'LIST_FAILED');

    const arr = (data ?? []) as Array<Record<string, unknown>>;
    const rows = arr.map((r) => ({
      learnerId: r.learner_id as string,
      learnerName: (r.learner_name ?? null) as string | null,
      registerNumber: (r.register_number ?? null) as string | null,
      programName: (r.program_name ?? null) as string | null,
      degreeType: (r.degree_type ?? null) as string | null,
      admissionYear:
        r.admission_year === null || r.admission_year === undefined
          ? null
          : Number(r.admission_year),
      yearKnown: Boolean(r.year_known),
    }));
    // total_count travels on every row (window count); 0 rows ⇒ empty roster.
    const total = arr.length > 0 ? Number(arr[0].total_count ?? rows.length) : 0;
    return successResponse({ rows, total });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);
