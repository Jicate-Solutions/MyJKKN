// app/api/public/booking/reschedule/[uid]/route.ts
//
// Attendee self-service reschedule API (Universal Booking U5, D16).
// PUBLIC — auth is the booking's cancel_token (the same capability that
// authorises cancel; one link family per booking, only ever sent to the
// attendee's inbox).
//
//   POST { token }                → live slots for the booking's meeting type
//   POST { token, start: <ISO> }  → move the booking (instant, D2)
//
// Works for ANY booking — funnel or personal page — regardless of the
// host's page visibility: rescheduling an existing meeting is not a new
// public exposure. Static 'reschedule' segment outranks the sibling
// /api/public/booking/[slug] dynamic route for nested paths.
//
// Pattern: app/api/public/booking/[slug]/{slots,book} (rate limit, shapes).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';

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

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Token gate BEFORE anything leaves the server (same posture as the
    // cancel page — generic error for unknown uid AND wrong token).
    const { data: booking } = await supabase
      .from('meeting_bookings')
      .select('cancel_token, status, meeting_type_id')
      .eq('uid', uid)
      .maybeSingle();
    if (!booking || booking.cancel_token !== token) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
    }
    if (booking.status !== 'confirmed') {
      return NextResponse.json({ error: 'not_confirmed' }, { status: 409 });
    }

    // ── Mode 1: list slots ────────────────────────────────────────────────
    if (!start) {
      const slots = await NativeSchedulingService.listSlots(
        supabase,
        booking.meeting_type_id,
        { days: 14 },
      );
      if (!slots) {
        return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
      }
      return NextResponse.json({ days: slots.days, durationMin: slots.durationMin });
    }

    // ── Mode 2: move the booking ──────────────────────────────────────────
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime()) || startDate.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Invalid or past time slot' }, { status: 400 });
    }

    const result = await NativeSchedulingService.rescheduleBooking(
      supabase,
      uid,
      { cancelToken: token },
      start,
    );
    if (!result.success) {
      if (result.error === 'SLOT_TAKEN' || result.error === 'INVALID_SLOT') {
        return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
      }
      if (result.error === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Could not reschedule. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, uid: result.uid, start: result.start });
  } catch (err) {
    console.error('[public/booking/reschedule] failed:', err);
    return NextResponse.json(
      { error: 'Could not reschedule. Please try again.' },
      { status: 500 },
    );
  }
}
