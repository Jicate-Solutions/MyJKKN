/**
 * POST /api/rcltp/recordings/upload-url
 * RCLTP v2 Phase 3 — mint a short-lived SIGNED UPLOAD URL for a student's Part A
 * voice recording into the PRIVATE rcltp-audio bucket. Flow:
 *   1. client POSTs { assessment_id, content_type? } here  → gets { path, signed_url, token }
 *   2. client uploads the audio file directly to signed_url  (kept out of Next.js)
 *   3. client POSTs .../recording with audio_path = path     → creates the recording row
 *
 * SECURITY: the SERVER controls the storage path (institution/learner/assessment/…),
 * so a student can only ever write their OWN recording. The bucket is private with
 * NO authenticated/public object policies — only these service-role signed URLs grant
 * write access, so children's voice recordings are never broadly readable.
 *
 * Gate: rcltp.assessment.take. Ownership: the assessment must belong to the session learner.
 * Body: { assessment_id, content_type? }
 */

export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  notFoundResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import { rcltpAdminClient, readJson, resolveLearnerId } from '@/app/api/rcltp/_lib/route-helpers';

const ALLOWED_AUDIO = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'];
const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
};

interface UploadUrlBody {
  assessment_id?: string;
  content_type?: string;
}

export const POST = withAuth(
  async (request, auth) => {
    const learnerId = await resolveLearnerId(auth);
    if (!learnerId) return forbiddenResponse('No learner profile is linked to this account');
    const institutionId = auth.user.institution_id;
    if (!institutionId) return forbiddenResponse('No institution context for this account');

    const body = await readJson<UploadUrlBody>(request);
    if (!body.assessment_id) return errorResponse('assessment_id is required', 400);
    const contentType =
      body.content_type && ALLOWED_AUDIO.includes(body.content_type)
        ? body.content_type
        : 'audio/webm';

    const admin = rcltpAdminClient();

    // OWNERSHIP — the sitting must belong to this learner in this institution.
    const { data: a, error: fErr } = await admin
      .from('rcltp_assessments')
      .select('id, learner_id, institution_id')
      .eq('id', body.assessment_id)
      .maybeSingle();
    if (fErr) return handleSupabaseError(fErr);
    if (!a) return notFoundResponse('Assessment');
    if (a.learner_id !== learnerId || a.institution_id !== institutionId) {
      return forbiddenResponse('This assessment does not belong to you');
    }

    // Server-controlled path — scoped to institution/learner/assessment so the
    // student can only ever write their own recording. (matches the recording
    // route's `${institution}/${learner}/` scope guard.)
    const ext = EXT[contentType] ?? 'webm';
    const path = `${institutionId}/${learnerId}/${body.assessment_id}/${randomUUID()}.${ext}`;

    const { data: signed, error: sErr } = await admin.storage
      .from('rcltp-audio')
      .createSignedUploadUrl(path);
    if (sErr || !signed) {
      return errorResponse(sErr?.message || 'Could not create upload URL', 500, 'STORAGE_ERROR');
    }

    return successResponse({
      path: signed.path ?? path,
      signed_url: signed.signedUrl,
      token: signed.token,
      content_type: contentType,
    });
  },
  { requirePermission: 'rcltp.assessment.take', allowApiKey: false }
);
