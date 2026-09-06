/**
 * GET /api/rcltp/recordings/:id/audio-url
 * Mint a short-lived signed DOWNLOAD url for a Part A recording's audio in the
 * PRIVATE rcltp-audio bucket. The bucket has NO authenticated-read object policy
 * (children's voice is sensitive), so a staff CLIENT cannot sign the URL itself —
 * only this service-role route can. Used by the teacher recording-review console.
 *
 * Gate: rcltp.review. Institution-scoped: the reviewer must be able to act on the
 * recording's institution (own tenant, or a platform admin across tenants).
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
import { rcltpAdminClient, actorMayActOnInstitution } from '@/app/api/rcltp/_lib/route-helpers';

export const GET = withAuth(
  async (_request, auth, context) => {
    const params = await context?.params;
    const recordingId = params?.id;
    if (!recordingId) return errorResponse('Recording id is required', 400);

    const admin = rcltpAdminClient();
    const { data: rec, error } = await admin
      .from('rcltp_part_a_recordings')
      .select('id, institution_id, audio_path')
      .eq('id', recordingId)
      .maybeSingle();
    if (error) return handleSupabaseError(error);
    if (!rec) return notFoundResponse('Recording');
    if (!rec.audio_path) {
      return errorResponse('This recording has no uploaded audio', 409);
    }

    // Institution scope — a teacher may only review within their own tenant; a
    // platform admin may review across tenants. The service-role read above
    // bypasses RLS, so this manual check is the multi-tenant boundary.
    const allowed = await actorMayActOnInstitution(auth, rec.institution_id);
    if (!allowed) {
      return forbiddenResponse('This recording is outside your institution');
    }

    const { data: signed, error: sErr } = await admin.storage
      .from('rcltp-audio')
      .createSignedUrl(rec.audio_path, 3600);
    if (sErr || !signed?.signedUrl) {
      return errorResponse(
        sErr?.message || 'Could not create a playable link',
        500,
        'STORAGE_ERROR'
      );
    }

    return successResponse({ signed_url: signed.signedUrl });
  },
  { requirePermission: 'rcltp.review', allowApiKey: false }
);
