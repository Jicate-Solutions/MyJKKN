// app/api/public/booking/[slug]/book/route.ts
// POST — confirm a routed booking: validate the event type against the config's
// eligible pool, create the booking on Cal.com (public endpoint), and write the
// meeting_routing_log audit row. PUBLIC (no auth) — powers /book/[slug].
// Added: 2026-06-11 — Path W task #10
//
// Pattern: app/api/public/forms/[slug]/submit/route.ts (service-role client +
// in-memory IP rate limit + honeypot).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MeetingRoutingService } from '@/lib/services/integrations/meeting-routing-service';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';

export const dynamic = 'force-dynamic';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (body.honeypot) {
      // Spam bot — pretend success without creating anything.
      return NextResponse.json({ success: true, uid: null });
    }

    // ── Input validation ──────────────────────────────────────────────────
    const meetingTypeId = typeof body.meetingTypeId === 'string' ? body.meetingTypeId : '';
    const start = typeof body.start === 'string' ? body.start : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : '';
    const answers: Record<string, string> = {};
    if (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) {
      for (const [k, v] of Object.entries(body.answers)) {
        if (typeof v === 'string') answers[String(k).slice(0, 200)] = v.slice(0, 500);
      }
    }

    if (!meetingTypeId) {
      return NextResponse.json({ error: 'Invalid meeting reference' }, { status: 400 });
    }
    const startDate = new Date(start);
    if (!start || Number.isNaN(startDate.getTime()) || startDate.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Invalid or past time slot' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const config = await MeetingRoutingService.getActiveConfigBySlug(supabase, slug);
    if (!config) {
      return NextResponse.json({ error: 'Booking page not found' }, { status: 404 });
    }

    // Re-derive the pool server-side — the client cannot substitute an
    // arbitrary meetingTypeId (it must belong to this config's institution).
    const pick = await MeetingRoutingService.validateMeetingTypeInPool(
      supabase,
      config,
      meetingTypeId,
    );
    if (!pick) {
      return NextResponse.json(
        { error: 'That counselor is no longer available. Please reload and try again.' },
        { status: 409 },
      );
    }

    // ── Create the booking on the NATIVE engine (Phase N2) ───────────────
    // createBooking re-validates the slot against the engine and the gist
    // exclusion constraint arbitrates concurrent races (23P01 → SLOT_TAKEN).
    const booking = await NativeSchedulingService.createBooking(supabase, {
      meetingTypeId,
      start,
      attendeeName: name,
      attendeeEmail: email,
      attendeePhone: phone || null,
      answers,
      source: 'routing-form',
    });
    if (!booking.success) {
      if (booking.error === 'SLOT_TAKEN' || booking.error === 'INVALID_SLOT') {
        // Taken while the visitor decided (or no longer offered) — same UX.
        return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
      }
      if (booking.error === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Booking page not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Could not complete the booking. Please try again.' },
        { status: 500 },
      );
    }

    // ── Audit row (non-fatal on failure — booking already exists) ────────
    await MeetingRoutingService.logRoutedBooking(supabase, {
      config,
      pick,
      calBookingUid: booking.uid, // native uid (column name is historic)
      startTime: start,
      attendeeName: name,
      attendeeEmail: email,
      attendeePhone: phone || null,
      answers,
    });

    return NextResponse.json({
      success: true,
      uid: booking.uid,
      start,
      counselorName: pick.name,
      durationMin: config.meeting_duration_min,
    });
  } catch (err) {
    console.error('[public/booking/book] failed:', err);
    return NextResponse.json(
      { error: 'Could not complete the booking. Please try again.' },
      { status: 500 },
    );
  }
}
