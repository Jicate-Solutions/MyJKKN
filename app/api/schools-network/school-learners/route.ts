// app/api/schools-network/school-learners/route.ts
// ============================================================================
// GET /api/schools-network/school-learners?school=<name>&level=<ug|pg|other>&limit=&offset=
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
    // level: 'ug' | 'pg' | 'other' filter by JKKN program level; anything else → all.
    const levelParam = searchParams.get('level');
    const level =
      levelParam === 'ug' || levelParam === 'pg' || levelParam === 'other'
        ? levelParam
        : null;
    // Pagination — clamped HERE (1..200 / >=0) so out-of-range input can't slip
    // to the fn and silently return 1 row (advisory review LOW). Defaults 25 / 0.
    const limitParam = parseInt(searchParams.get('limit') ?? '', 10);
    const offsetParam = parseInt(searchParams.get('offset') ?? '', 10);
    const p_limit = Number.isFinite(limitParam)
      ? Math.min(200, Math.max(1, limitParam))
      : 25;
    const p_offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;

    const { data, error } = await auth.supabase.rpc(
      'fn_schools_network_school_learners',
      { p_school_name: school, p_degree_type: level, p_limit, p_offset }
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
    let total = arr.length > 0 ? Number(arr[0].total_count ?? rows.length) : 0;
    // Past-the-end page (offset beyond the last row — e.g. after an unmerge
    // shrinks a roster while the user sits on a later page): total_count rides
    // only on returned rows, so an empty page would misreport total=0 and strand
    // the pager (advisory review). Recover the window total with a 1-row probe
    // at offset 0, mirroring the feeders route.
    if (arr.length === 0 && p_offset > 0) {
      const probe = await auth.supabase.rpc('fn_schools_network_school_learners', {
        p_school_name: school,
        p_degree_type: level,
        p_limit: 1,
        p_offset: 0,
      });
      // The probe recovers the window total for a past-the-end page. If the
      // probe itself errors we can't recover the total — it stays 0 (a rare
      // double-failure); the guard only avoids trusting a failed probe's null
      // data, it doesn't invent a total. The detail page resets to page 1 on
      // school change, so a past-the-end offset is unlikely to arise at all.
      if (!probe.error) {
        const parr = (probe.data ?? []) as Array<Record<string, unknown>>;
        total = parr.length > 0 ? Number(parr[0].total_count ?? 0) : 0;
      }
    }
    return successResponse({ rows, total });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);
