// app/api/public/booking/[slug]/slots/route.ts
// POST — round-robin pick a counselor for this routing config and return their
// live availability for the next 7 days. PUBLIC (no auth) — powers /book/[slug].
// Added: 2026-06-11 — Path W task #10
//
// Pattern: app/api/public/forms/[slug]/submit/route.ts (service-role client +
// in-memory IP rate limit + honeypot).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MeetingRoutingService } from '@/lib/services/integrations/meeting-routing-service';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';

export const dynamic = 'force-dynamic';

// Slot browsing is read-only and visitors may retry dates — allow more than
// the booking route, but still bound it.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
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
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (body?.honeypot) {
      // Spam bot filled the invisible field — pretend success, return nothing.
      return NextResponse.json({ counselor: null, days: {} });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const config = await MeetingRoutingService.getActiveConfigBySlug(supabase, slug);
    if (!config) {
      return NextResponse.json({ error: 'Booking page not found' }, { status: 404 });
    }

    const pick = await MeetingRoutingService.pickCounselor(supabase, config);
    if (!pick) {
      // Explicit, never silent (rule #27) — the UI shows a phone-the-office state.
      return NextResponse.json(
        { error: 'no_counselors_available' },
        { status: 503 },
      );
    }

    // Phase N2: slots come from the NATIVE engine (no Cal.com round-trip).
    const result = await NativeSchedulingService.listSlots(supabase, pick.meetingTypeId, {
      days: 7,
    });

    return NextResponse.json({
      counselor: { name: pick.name },
      meetingTypeId: pick.meetingTypeId,
      durationMin: result?.durationMin ?? config.meeting_duration_min,
      days: result?.days ?? {},
    });
  } catch (err) {
    console.error('[public/booking/slots] failed:', err);
    return NextResponse.json(
      { error: 'Could not load available times. Please try again.' },
      { status: 500 },
    );
  }
}
