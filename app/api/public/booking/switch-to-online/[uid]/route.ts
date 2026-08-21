// app/api/public/booking/switch-to-online/[uid]/route.ts
//
// Attendee-initiated "can we make this a video call?" request.
// PUBLIC — auth is the booking's cancel_token, exactly like the sibling
// reschedule route: one link family per booking, only ever sent to the
// attendee's inbox. A caller-supplied user id is never trusted here.
//
//   POST { token }                → record a pending request, keep the time
//   POST { token, start: <ISO> }  → record a pending request AND ask to move it
//
// Decision 4: this NEVER takes effect on its own. The route can only create a
// PENDING request — it does not switch the mode, does not touch start_time and
// does not mint a Meet link. Only the host's approval does that.
//
// A sibling route rather than a mode on /reschedule because the shapes differ:
// reschedule MOVES the booking immediately, this one only ASKS. Folding them
// together would make "does this request mutate the booking?" depend on a body
// key, which is exactly the sort of thing that gets misread later.
//
// Pattern: app/api/public/booking/reschedule/[uid]/route.ts (rate limit, shapes).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MeetingModeSwitchService } from '@/lib/services/meetings/meeting-mode-switch-service';

export const dynamic = 'force-dynamic';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  try {
    const { uid } = await params;

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    const start = typeof body?.start === 'string' ? body.start : '';
    if (!uid || !token) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
    }
    if (start) {
      const startDate = new Date(start);
      if (Number.isNaN(startDate.getTime()) || startDate.getTime() < Date.now()) {
        return NextResponse.json({ error: 'Invalid or past time slot' }, { status: 400 });
      }
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // The token gate lives inside the service, which answers the same opaque
    // NOT_FOUND for an unknown uid and a wrong token.
    const result = await MeetingModeSwitchService.requestSwitchToOnline(supabase, uid, token, {
      newStart: start || null,
    });

    if (!result.ok) {
      switch (result.error) {
        case 'NOT_FOUND':
          return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
        case 'ALREADY_ONLINE':
          return NextResponse.json({ error: 'already_online' }, { status: 409 });
        case 'UNSUPPORTED_SOURCE_MODE':
          // A mode this feature has never been decided for. No longer phone,
          // which switches exactly as in person does since ruling 1
          // (2026-08-21). Its own code, not already_online — telling a visitor
          // their meeting is "already online" would be a lie.
          return NextResponse.json({ error: 'unsupported_mode' }, { status: 409 });
        case 'TOO_LATE':
          return NextResponse.json({ error: 'too_late' }, { status: 409 });
        case 'CALENDAR_NOT_CONNECTED':
          // Named rather than generic (decision 7): the visitor is told why it
          // cannot happen instead of being asked to try again forever.
          return NextResponse.json({ error: 'calendar_not_connected' }, { status: 409 });
        case 'INVALID_SLOT':
          return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
        default:
          return NextResponse.json(
            { error: 'Could not send the request. Please try again.' },
            { status: 500 },
          );
      }
    }

    // 'pending' is the whole answer: the host has to say yes.
    return NextResponse.json({ success: true, uid, status: 'pending' });
  } catch (err) {
    console.error('[public/booking/switch-to-online] failed:', err);
    return NextResponse.json(
      { error: 'Could not send the request. Please try again.' },
      { status: 500 },
    );
  }
}
