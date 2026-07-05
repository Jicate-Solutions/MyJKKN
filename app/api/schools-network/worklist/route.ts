// app/api/schools-network/worklist/route.ts
// ============================================================================
// GET  /api/schools-network/worklist → the visit worklist: one row per adopted
//      school with its feeder momentum (cycle_delta), assigned coordinator,
//      last visit, ✓visit/✓contribution status, and a needs-nudge flag. Backed
//      by fn_schools_network_visit_worklist (SECURITY DEFINER, schools.view
//      gated inside). Org-wide, no PII (see the migration's SCOPE NOTE).
//
// POST /api/schools-network/worklist → assign (or unassign) one school to a
//      coordinator. Body { schoolId, assignedTo|null }. schools.edit gated via
//      fn_schools_network_assign_visit.
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const GET = withAuth(
  async (_request, auth) => {
    await connection();

    const { data, error } = await auth.supabase.rpc('fn_schools_network_visit_worklist');
    if (error) return errorResponse(error.message, 500, 'WORKLIST_FAILED');

    const arr = (data ?? []) as Array<Record<string, unknown>>;
    const rows = arr.map((r) => ({
      schoolId: r.school_id as string,
      schoolName: (r.school_name ?? '') as string,
      district: (r.district ?? null) as string | null,
      cycleDelta:
        r.cycle_delta === null || r.cycle_delta === undefined ? null : Number(r.cycle_delta),
      assignedTo: (r.assigned_to ?? null) as string | null,
      assignedToName: (r.assigned_to_name ?? null) as string | null,
      lastVisit: (r.last_visit ?? null) as string | null,
      hasContribution: Boolean(r.has_contribution),
      hasSession: Boolean(r.has_session),
      isDone: Boolean(r.is_done),
      nudgeEligible: Boolean(r.nudge_eligible),
      lastNudgedAt: (r.last_nudged_at ?? null) as string | null,
    }));
    const total = arr.length > 0 ? Number(arr[0].total_count ?? rows.length) : 0;

    return successResponse({ rows, total });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);

export const POST = withAuth(
  async (request, auth) => {
    await connection();

    let body: { schoolId?: string; assignedTo?: string | null };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'VALIDATION_ERROR');
    }

    const schoolId = (body.schoolId ?? '').trim();
    if (!schoolId) return errorResponse('schoolId is required', 400, 'VALIDATION_ERROR');
    // assignedTo === null (or omitted) clears the assignment; a string sets it.
    const assignedTo =
      body.assignedTo === null || body.assignedTo === undefined
        ? null
        : String(body.assignedTo).trim() || null;

    const { error } = await auth.supabase.rpc('fn_schools_network_assign_visit', {
      p_school_id: schoolId,
      p_assigned_to: assignedTo,
    });
    if (error) {
      const status = error.code === '42501' ? 403 : 400;
      return errorResponse(error.message, status, 'ASSIGN_FAILED');
    }
    return successResponse({ schoolId, assignedTo });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.edit' }
);
