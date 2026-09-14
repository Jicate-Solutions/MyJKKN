/**
 * Online Meetings — live writes for a SIGNED-IN participant.
 *
 * POST /api/online-meetings/live/join
 *                              /heartbeat
 *                              /poll      { poll_id, option_id }
 *                              /quiz      { answers }
 *
 * Body always carries `meeting_id`.
 *
 * Wrapped in withAuth, which puts the caller's own RLS-carrying client into
 * AsyncLocalStorage and hands it to us on `auth.supabase`. RLS is therefore
 * live on every statement below — this route cannot write somebody else's
 * attendance row even if the participant resolution were wrong.
 *
 * The guest twin is /api/public/online-meetings/live/[action]. Both call
 * runLiveAction with a resolved participant, so the behaviour cannot diverge.
 * The ONLY difference between them is how identity is established.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { withAuth, type AuthContext } from '@/lib/auth/with-auth';
import {
  isLiveAction,
  runLiveAction,
  type LiveActionBody,
} from '@/lib/services/online-meetings/live-actions';
import { getLiveMeeting, resolveParticipantByProfile } from '@/lib/services/online-meetings/live-service';

interface Body extends LiveActionBody {
  meeting_id?: string;
}

async function handler(
  request: NextRequest,
  auth: AuthContext,
  context?: { params?: Promise<Record<string, string>> },
) {
  const params = (await context?.params) ?? {};
  const action = params.action;

  if (!isLiveAction(action)) {
    return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const meetingId = body.meeting_id;
  if (!meetingId) {
    return NextResponse.json(
      { ok: false, error: 'meeting_id is required.' },
      { status: 400 },
    );
  }

  const who = await resolveParticipantByProfile(auth.supabase, meetingId, auth.user.id);
  if (!who.ok) {
    // Not on the invitation list is a 403, not a 404: the meeting exists and
    // saying so is harmless — RLS already decided they cannot read it.
    return NextResponse.json({ ok: false, error: who.error }, { status: 403 });
  }

  const result = await runLiveAction(auth.supabase, who.data, action, body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // Return the refreshed live payload rather than just the write's result, so
  // the page re-renders from one authoritative read instead of patching its
  // own copy of the state and slowly diverging from the database.
  const live = await getLiveMeeting(auth.supabase, who.data);
  return NextResponse.json({
    ok: true,
    data: result.data,
    live: live.ok ? live.data : null,
  });
}

export const POST = withAuth(handler, {
  // Browser session only. An API key has no participant row, so there is
  // nothing for it to be here, and allowing one would mean a machine identity
  // could stamp somebody's attendance.
  allowApiKey: false,
});
