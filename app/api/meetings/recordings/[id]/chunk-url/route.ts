/**
 * POST /api/meetings/recordings/{id}/chunk-url — mint a short-lived signed
 * upload URL for ONE ~30-second chunk of an in-person recording.
 *
 * The phone uploads each chunk DIRECTLY to Supabase Storage with the returned
 * token, so a 96-minute meeting never travels through a Next.js function and
 * never meets a request-body limit. Same three-step handshake the RCLTP voice
 * recorder uses (app/api/rcltp/recordings/upload-url).
 *
 * THE SERVER CHOOSES THE PATH. The client sends only an index. That is what
 * stops a caller writing into somebody else's recording: the path is built from
 * the authenticated user's id and a recording row they own, never from input.
 *
 * Body: { index: number }  → { path, signed_url, token }
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
import { createAdminClient } from '@/lib/supabase/client';

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
};

/** A meeting is long, but not unbounded: 4 hours of 30 s chunks with headroom. */
const MAX_CHUNK_INDEX = 600;

export const POST = withAuth(async (request, auth, context) => {
  const params = await context?.params;
  const recordingId = params?.id;
  if (!recordingId) return errorResponse('Which recording?', 400);

  let body: { index?: number };
  try {
    body = (await request.json()) as { index?: number };
  } catch {
    return errorResponse('Send the chunk index.', 400);
  }

  const index = body.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > MAX_CHUNK_INDEX) {
    return errorResponse('That chunk number is not valid.', 400);
  }

  // Ownership and state, read under the caller's RLS.
  const { data: rec, error: readErr } = await auth.supabase
    .from('meeting_recordings')
    .select('id, recorded_by, status, mime_type')
    .eq('id', recordingId)
    .maybeSingle();
  if (readErr) return handleSupabaseError(readErr);
  if (!rec) return notFoundResponse('Recording');
  if (rec.recorded_by !== auth.user.id) {
    return forbiddenResponse('That recording is not yours.');
  }
  if (rec.status !== 'recording') {
    // Accepting a chunk after finish would silently extend a recording whose
    // chunk_count is already fixed — the concatenator would never read it.
    return errorResponse('This recording has already been finished.', 409);
  }

  const ext = EXT[rec.mime_type as string] ?? 'webm';
  const path = `${auth.user.id}/${recordingId}/${String(index).padStart(4, '0')}.${ext}`;

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from('meeting-audio')
    .createSignedUploadUrl(path);

  if (signErr || !signed) {
    return errorResponse(
      signErr?.message || 'Could not prepare the upload. Recording continues — it will retry.',
      500,
      'STORAGE_ERROR',
    );
  }

  return successResponse({
    path: signed.path ?? path,
    signed_url: signed.signedUrl,
    token: signed.token,
  });
}, { requiredPermission: 'write', allowApiKey: false });
