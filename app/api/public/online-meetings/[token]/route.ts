/**
 * Online Meetings — the guest read.
 *
 * GET /api/public/online-meetings/[token]
 *
 * UNAUTHENTICATED BY DESIGN. An external guest has no MyJKKN account — that is
 * the entire point of the module — so the token is their identity. The prefix
 * is allow-listed in proxy.ts; without that entry this route would be 307'd to
 * the login page before its handler ever ran, which is exactly how '/verify/'
 * and '/r/' each shipped broken.
 *
 * WHY SERVICE ROLE
 *   `anon` is REVOKED on every online_meeting* table. A guest has no other way
 *   to read anything, and giving anon a token-shaped RLS policy is not
 *   possible: RLS cannot see a value the caller merely claims. So authorization
 *   happens here, in reviewed TypeScript, and the narrowest thing in the module
 *   — resolveParticipantByToken — is what performs it. Read its comment before
 *   changing anything here.
 *
 * WHAT LEAVES THIS ROUTE
 *   Only the live payload for ONE participant of ONE meeting. No institution
 *   ids, no roster, no other participant's name, no join tokens. The guest
 *   learns the meeting they were invited to and nothing about JKKN beyond it.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import {
  getLiveMeeting,
  resolveParticipantByToken,
} from '@/lib/services/online-meetings/live-service';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const supabase = createServiceRoleClient();

  const who = await resolveParticipantByToken(supabase, token);
  if (!who.ok) {
    // 404, not 403. A 403 would confirm the token exists but is out of window,
    // and the token space should not answer questions about itself.
    return NextResponse.json({ ok: false, error: who.error }, { status: 404 });
  }

  const live = await getLiveMeeting(supabase, who.data);
  if (!live.ok) {
    return NextResponse.json({ ok: false, error: live.error }, { status: 500 });
  }

  // Best-effort: note that the invitation was opened. Never block the read on
  // it — a guest arriving at their meeting page matters more than a badge.
  if (who.data.kind === 'external') {
    await supabase
      .from('online_meeting_participants')
      .update({ invite_status: 'opened' })
      .eq('id', who.data.participantId)
      .eq('invite_status', 'sent');
  }

  return NextResponse.json({ ok: true, data: live.data });
}
