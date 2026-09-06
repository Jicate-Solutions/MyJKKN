/**
 * POST /api/rcltp/passages/next
 * RCLTP v2 Phase 3 — serve the next UNSEEN, grade-calibrated passage to the
 * session learner and log it to rcltp_passage_exposure (the no-repeat ledger;
 * a student-affecting write → service-role only).
 *
 * Deterministic selection (buildable now):
 *   approved + active + English + (institution-owned OR global) + not-yet-seen.
 * Level guardrail (E3): PREFER the learner's served_content_level when set, then
 * WIDEN to the nearest available level on the ladder (and only as a last resort
 * to any grade) before declaring none left — so an exhausted level degrades
 * gracefully instead of 404-ing. The continuous 80/50 nudge that CHANGES
 * served_content_level lives in the MyJKKN-gated results/journey step — not here.
 *
 * Gate: rcltp.assessment.take. Learner from session (get_my_learner_id), never body.
 * Body: { assessment_id?, grade_level? }
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  forbiddenResponse,
  notFoundResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import { rcltpAdminClient, readJson, resolveLearnerId } from '@/app/api/rcltp/_lib/route-helpers';

interface NextBody {
  assessment_id?: string;
  grade_level?: number;
}

export const POST = withAuth(
  async (request, auth) => {
    const learnerId = await resolveLearnerId(auth);
    if (!learnerId) return forbiddenResponse('No learner profile is linked to this account');
    const institutionId = auth.user.institution_id;
    if (!institutionId) return forbiddenResponse('No institution context for this account');

    const body = await readJson<NextBody>(request);
    const admin = rcltpAdminClient();

    // If an assessment_id is supplied it MUST belong to THIS learner in THIS institution
    // before we store it on the exposure FK — prevents a cross-tenant FK pointer and an
    // existence oracle (FK-violation vs success would leak whether a foreign id exists).
    let scopedAssessmentId: string | null = null;
    if (body.assessment_id) {
      const { data: owned, error: aErr } = await admin
        .from('rcltp_assessments')
        .select('id, learner_id, institution_id')
        .eq('id', body.assessment_id)
        .maybeSingle();
      if (aErr) return handleSupabaseError(aErr);
      if (!owned || owned.learner_id !== learnerId || owned.institution_id !== institutionId) {
        return forbiddenResponse('This assessment does not belong to you');
      }
      scopedAssessmentId = owned.id;
    }

    // E3 guardrail: serve at the learner's nudged content level when one exists.
    const { data: journey } = await admin
      .from('rcltp_student_journey')
      .select('served_content_level')
      .eq('learner_id', learnerId)
      .eq('institution_id', institutionId)
      .not('served_content_level', 'is', null)
      // Deterministic: the journey is UNIQUE per (learner, dimension), so if more
      // than one dimension ever carries a served level, use the most recently
      // nudged one rather than an arbitrary row.
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const servedLevel: string | null = journey?.served_content_level ?? null;

    // No-repeat ledger: exclude already-seen passages.
    const { data: seen, error: sErr } = await admin
      .from('rcltp_passage_exposure')
      .select('passage_id')
      .eq('learner_id', learnerId);
    if (sErr) return handleSupabaseError(sErr);
    const seenIds = (seen ?? []).map((r: { passage_id: string }) => r.passage_id).filter(Boolean);

    // Candidate pool of UNSEEN passages (approved/active/en, institution-or-global).
    // Q4 "widen to nearby levels": we do NOT hard-filter by content_level. We fetch
    // the pool and rank by nearness to the served level, so an exhausted served level
    // falls back to the closest available level instead of returning 404.
    const LADDER = ['letters', 'words', 'sentences', 'paragraphs', 'analytical'];
    const fetchPool = (applyGrade: boolean) => {
      let q = admin
        .from('rcltp_passages')
        .select('*')
        .eq('status', 'approved')
        .eq('is_active', true)
        .eq('language', 'en')
        .or(`institution_id.eq.${institutionId},institution_id.is.null`);
      if (applyGrade && typeof body.grade_level === 'number') {
        q = q.eq('grade_level', body.grade_level);
      }
      if (seenIds.length > 0) q = q.not('id', 'in', `(${seenIds.join(',')})`);
      return q.order('created_at', { ascending: true }).limit(100);
    };

    // Within the requested grade first; only if that is dry, widen to any grade.
    let { data: pool, error: pErr } = await fetchPool(true);
    if (pErr) return handleSupabaseError(pErr);
    if ((!pool || pool.length === 0) && typeof body.grade_level === 'number') {
      ({ data: pool, error: pErr } = await fetchPool(false));
      if (pErr) return handleSupabaseError(pErr);
    }
    if (!pool || pool.length === 0) {
      return notFoundResponse('No unseen passage available for this learner');
    }

    // Prefer the served content level, then the NEAREST level on the ladder.
    // Array.sort is stable (ES2019+) so equal-distance ties keep oldest-created first.
    let passage = pool[0];
    if (servedLevel) {
      const si = LADDER.indexOf(servedLevel);
      passage = [...pool].sort(
        (a: { content_level: string | null }, b: { content_level: string | null }) => {
          const da = a.content_level ? Math.abs(LADDER.indexOf(a.content_level) - si) : 99;
          const db = b.content_level ? Math.abs(LADDER.indexOf(b.content_level) - si) : 99;
          return da - db;
        }
      )[0];
    }

    // Log exposure (student-affecting write — scoped to the session learner/institution).
    const { error: exErr } = await admin.from('rcltp_passage_exposure').insert({
      learner_id: learnerId,
      institution_id: institutionId,
      passage_id: passage.id,
      assessment_id: scopedAssessmentId,
    });
    if (exErr) return handleSupabaseError(exErr);

    return successResponse(passage);
  },
  { requirePermission: 'rcltp.assessment.take', allowApiKey: false }
);
