/**
 * Online Meetings — live writes for a TOKEN-BEARING GUEST.
 *
 * POST /api/public/online-meetings/live/join
 *                                      /heartbeat
 *                                      /poll   { poll_id, option_id }
 *                                      /quiz   { answers }
 *
 * Body always carries `join_token` and `meeting_id`.
 *
 * THIS ROUTE RUNS AS SERVICE ROLE, SO RLS IS OFF.
 *   That makes `resolveParticipantByToken` the only thing standing between a
 *   POST and the database, and it is why it refuses an unknown token, a token
 *   belonging to a different meeting, a cancelled meeting, and a meeting
 *   outside its join window plus async quiz window. A service-role route with
 *   no such check is not "a public API" — it is an unauthenticated write
 *   endpoint. Do not relax it, and do not add an action that skips it.
 *
 * Everything after identity is shared with the signed-in twin at
 * /api/online-meetings/live/[action] via runLiveAction, so a guest and a
 * colleague are subject to exactly the same rules about closed polls, repeat
 * joins, one quiz attempt, and the make-up window.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import {
  isLiveAction,
  runLiveAction,
  type LiveActionBody,
} from '@/lib/services/online-meetings/live-actions';
import {
  getLiveMeeting,
  resolveParticipantByToken,
} from '@/lib/services/online-meetings/live-service';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface Body extends LiveActionBody {
  join_token?: string;
  meeting_id?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  if (!isLiveAction(action)) {
    return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.join_token || !body.meeting_id) {
    return NextResponse.json(
      { ok: false, error: 'join_token and meeting_id are required.' },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();

  // The meeting id is passed as well as the token, and the resolver checks
  // they agree. A caller who guessed a token cannot then aim it at a different
  // meeting, and a stale client that kept a token after the host regenerated
  // it fails here rather than writing to the wrong row.
  const who = await resolveParticipantByToken(supabase, body.join_token, body.meeting_id);
  if (!who.ok) {
    return NextResponse.json({ ok: false, error: who.error }, { status: 403 });
  }

  const result = await runLiveAction(supabase, who.data, action, body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  const live = await getLiveMeeting(supabase, who.data);
  return NextResponse.json({
    ok: true,
    data: result.data,
    live: live.ok ? live.data : null,
  });
}
