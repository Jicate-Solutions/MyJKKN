/**
 * POST /api/rcltp/practice/:id/complete
 * RCLTP v2 Phase 3 — record the session learner's completion of an assigned
 * practice set (deterministic). exercises_completed drives band progression, so
 * a student cannot self-mark it client-side — this is the service-role path.
 * Gate: rcltp.assessment.take. Ownership: the assignment must belong to the
 * session learner in the session institution.
 * Body: { exercises_completed? }  (defaults to exercises_assigned = "all done")
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  notFoundResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import { rcltpAdminClient, readJson, resolveLearnerId } from '@/app/api/rcltp/_lib/route-helpers';

interface CompleteBody {
  exercises_completed?: number;
}

export const POST = withAuth(
  async (request, auth, context) => {
    const params = await context?.params;
    const assignmentId = params?.id;
    if (!assignmentId) return errorResponse('Practice assignment id is required', 400);

    const learnerId = await resolveLearnerId(auth);
    if (!learnerId) return forbiddenResponse('No learner profile is linked to this account');
    const institutionId = auth.user.institution_id;
    if (!institutionId) {
      return forbiddenResponse('No institution context for this account');
    }

    const body = await readJson<CompleteBody>(request);
    const admin = rcltpAdminClient();

    const { data: pa, error: fErr } = await admin
      .from('rcltp_practice_assignments')
      .select('id, learner_id, institution_id, exercises_assigned, exercises_completed, status')
      .eq('id', assignmentId)
      .maybeSingle();
    if (fErr) return handleSupabaseError(fErr);
    if (!pa) return notFoundResponse('Practice assignment');
    if (pa.learner_id !== learnerId || pa.institution_id !== institutionId) {
      return forbiddenResponse('This practice assignment does not belong to you');
    }

    // STATE GUARD — only an open assignment may be completed (mirror submit/start).
    if (!['assigned', 'in_progress'].includes(pa.status)) {
      return errorResponse(`Cannot complete a practice set in status "${pa.status}"`, 409);
    }

    const assigned = typeof pa.exercises_assigned === 'number' ? pa.exercises_assigned : 0;
    const requested =
      typeof body.exercises_completed === 'number' ? body.exercises_completed : assigned;
    // Clamp to [0, assigned] UNCONDITIONALLY — a student may only report up to what was
    // assigned (assigned=0 -> completed=0). Keeps the band-progression input out of student
    // control and prevents smallint (max 32767) overflow.
    const completed = Math.max(0, Math.min(Math.trunc(requested), assigned));
    const status = assigned > 0 && completed >= assigned ? 'completed' : 'in_progress';

    const now = new Date().toISOString();
    const { data, error: uErr } = await admin
      .from('rcltp_practice_assignments')
      .update({ exercises_completed: completed, status, updated_at: now })
      .eq('id', assignmentId)
      .eq('learner_id', learnerId)
      .eq('institution_id', institutionId)
      .select()
      .single();
    if (uErr) return handleSupabaseError(uErr);
    return successResponse(data);
  },
  { requirePermission: 'rcltp.assessment.take', allowApiKey: false }
);
