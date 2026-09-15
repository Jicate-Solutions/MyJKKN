/**
 * POST /api/meetings/recordings/{id}/finish — the meeting is over.
 *
 * Fixes chunk_count, which is the number the concatenator trusts, and starts the
 * 90-day clock on the audio (Director, 15 Sep: keep the audio 90 days, then
 * delete; the transcript outlives it).
 *
 * WHY THIS VERIFIES INSTEAD OF BELIEVING
 * The phone reports how many chunks it uploaded. A phone that lost signal for
 * the last four minutes reports the same number it hoped for. So this route
 * LISTS what actually landed in storage and records that — and when the two
 * disagree it says so in `error` rather than quietly transcribing a short
 * meeting as if it were whole. A transcript missing its last ten minutes, with
 * nothing saying so, is worse than no transcript.
 *
 * Body: { chunks_sent?: number, duration_seconds?: number }
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

/** Director's decision, 15 Sep: the audio goes after 90 days. */
const AUDIO_RETENTION_DAYS = 90;

export const POST = withAuth(async (request, auth, context) => {
  const params = await context?.params;
  const recordingId = params?.id;
  if (!recordingId) return errorResponse('Which recording?', 400);

  let body: { chunks_sent?: number; duration_seconds?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // A finish with no body is still a finish — the phone may be on its last gasp.
  }

  const { data: rec, error: readErr } = await auth.supabase
    .from('meeting_recordings')
    .select('id, recorded_by, status')
    .eq('id', recordingId)
    .maybeSingle();
  if (readErr) return handleSupabaseError(readErr);
  if (!rec) return notFoundResponse('Recording');
  if (rec.recorded_by !== auth.user.id) return forbiddenResponse('That recording is not yours.');

  // What actually landed. Ask storage, not the phone.
  const admin = createAdminClient();
  const { data: objects, error: listErr } = await admin.storage
    .from('meeting-audio')
    .list(`${auth.user.id}/${recordingId}`, { limit: 1000 });
  if (listErr) return errorResponse(listErr.message, 500, 'STORAGE_ERROR');

  const landed = (objects ?? []).filter((o) => o.name && !o.name.startsWith('.'));
  const bytesTotal = landed.reduce(
    (sum, o) => sum + Number((o.metadata as { size?: number } | null)?.size ?? 0),
    0,
  );

  // Chunks are named 0000, 0001, … — a gap means one upload never arrived.
  const indices = landed
    .map((o) => Number.parseInt(o.name.split('.')[0], 10))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
  const expected = typeof body.chunks_sent === 'number' ? body.chunks_sent : indices.length;
  const missing: number[] = [];
  for (let i = 0; i < expected; i += 1) if (!indices.includes(i)) missing.push(i);

  const complete = missing.length === 0 && indices.length > 0;
  const problem = indices.length === 0
    ? 'No audio reached the server — nothing was saved for this meeting.'
    : missing.length > 0
      ? `${missing.length} of ${expected} pieces of audio did not reach the server, so this recording has gaps.`
      : null;

  const deleteAfter = new Date();
  deleteAfter.setDate(deleteAfter.getDate() + AUDIO_RETENTION_DAYS);

  const { data: updated, error: updErr } = await auth.supabase
    .from('meeting_recordings')
    .update({
      // A gapped recording is still worth transcribing — it is simply labelled.
      status: indices.length === 0 ? 'failed' : 'uploaded',
      chunk_count: indices.length,
      bytes_total: bytesTotal,
      duration_seconds: body.duration_seconds ?? null,
      finished_at: new Date().toISOString(),
      audio_delete_after: indices.length === 0 ? null : deleteAfter.toISOString(),
      error: problem,
    })
    .eq('id', recordingId)
    .select('id, title, status, chunk_count, bytes_total, duration_seconds, error')
    .single();

  if (updErr) return handleSupabaseError(updErr);
  return successResponse({ ...updated, complete });
}, { requiredPermission: 'write', allowApiKey: false });
