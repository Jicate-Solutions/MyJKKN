/**
 * POST /api/meetings/recordings — start recording a meeting held in a ROOM.
 * GET  /api/meetings/recordings — the caller's own recent recordings.
 *
 * Creates the row the phone then uploads chunks against. Nothing is stored yet;
 * this hands back an id and the caller's permission to record at all.
 *
 * WHY A SEPARATE LANE FROM THE BOOKING FLOW
 * A meeting in a room has no Meet link, no calendar event and no attendee list.
 * It is not a booking with the video missing — it is a different object, and
 * pretending otherwise is how a recording gets stapled onto the wrong meeting.
 * `booking_id` stays available for the day a room meeting was in fact booked.
 *
 * GATE: meeting_recorder_allowlist, read through fn_may_record_meetings() — a
 * SECURITY INVOKER function, so RLS keeps the answer to the caller's own row.
 * Recording a room of colleagues is granted by name (Director, 15 Sep), so a
 * caller who is not on the list gets 403 and the page never shows the button.
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  createdResponse,
  errorResponse,
  forbiddenResponse,
  handleSupabaseError,
} from '@/lib/api/response';

interface StartBody {
  title?: string;
  /** The recorder confirms they told the room out loud. */
  announced?: boolean;
  mime_type?: string;
  booking_id?: string;
}

const ALLOWED_MIME = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'];

export const POST = withAuth(async (request, auth) => {
  const supabase = auth.supabase;

  const { data: mayRecord, error: gateErr } = await supabase.rpc('fn_may_record_meetings');
  if (gateErr) return handleSupabaseError(gateErr);
  if (mayRecord !== true) {
    return forbiddenResponse(
      'You are not set up to record meetings. Ask an administrator to add you.',
    );
  }

  let body: StartBody;
  try {
    body = (await request.json()) as StartBody;
  } catch {
    return errorResponse('Send a title for this meeting.', 400);
  }

  const title = (body.title ?? '').trim();
  if (!title) return errorResponse('Give this meeting a title before recording.', 400);
  if (title.length > 200) return errorResponse('That title is too long.', 400);

  const mime = body.mime_type && ALLOWED_MIME.includes(body.mime_type) ? body.mime_type : 'audio/webm';

  const { data, error } = await supabase
    .from('meeting_recordings')
    .insert({
      recorded_by: auth.user.id,
      institution_id: auth.user.institution_id ?? null,
      title,
      mime_type: mime,
      booking_id: body.booking_id ?? null,
      announced_at: body.announced === true ? new Date().toISOString() : null,
      status: 'recording',
    })
    .select('id, title, status, started_at')
    .single();

  if (error) return handleSupabaseError(error);
  return createdResponse(data);
}, { requiredPermission: 'write', allowApiKey: false });

export const GET = withAuth(async (_request, auth) => {
  const { data, error } = await auth.supabase
    .from('meeting_recordings')
    .select('id, title, status, chunk_count, duration_seconds, started_at, finished_at, audio_deleted_at, error')
    .eq('recorded_by', auth.user.id)
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) return handleSupabaseError(error);
  return successResponse(data ?? []);
}, { requiredPermission: 'read', allowApiKey: false });
