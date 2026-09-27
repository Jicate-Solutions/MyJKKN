// app/api/public/interview-booking/slots/route.ts
// POST — open interview times on the shared booking link (/book-interview, #3).
// PUBLIC (no auth).
//
// There is no handle or type slug in the URL: which calendar interviews land
// in is a policy setting (#12), resolved server-side by resolveInterviewHost.
// A visitor therefore cannot point this route at anybody else's diary.
//
// Mirrors app/api/public/meet/[handle]/[typeSlug]/slots/route.ts: service-role
// client, in-memory per-IP limit, the same 14-day window and response shape
// (without the deposit fields — an interview is never paid for).
//
// hostAnyTime is never passed. It widens the offer to the host's whole day and
// is only for a caller that has proved the viewer IS the host.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';
import { resolveInterviewHost } from '@/lib/services/hr/interview-booking-service';
import { loadActiveStaffBooker } from '../book/active-staff';

export const dynamic = 'force-dynamic';

// Loading free times reveals nothing about anyone and is cheap, but every phone
// at a walk-in drive shares one campus IP and reloads times on each step — so
// the cap is generous (120 an hour per IP; staff exempt, #1). It only stops a
// runaway client, never a room full of candidates (review finding, 2026-09-24).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 120;
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

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // An office booking several candidates from one IP re-reads the times for
    // each of them, so active staff are not counted (#1) — the same exemption
    // the book route gives them.
    const staff = await loadActiveStaffBooker(supabase);
    if (!staff) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (!checkRateLimit(ip)) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429 },
        );
      }
    }

    const interviewHost = await resolveInterviewHost(supabase);
    if (!interviewHost) {
      return NextResponse.json({ error: 'not_open' }, { status: 404 });
    }
    const { host, meetingType } = interviewHost;

    const slots = await NativeSchedulingService.listSlots(supabase, meetingType.id, { days: 14 });
    if (!slots) {
      return NextResponse.json({ error: 'not_open' }, { status: 404 });
    }

    return NextResponse.json({
      hostName: host.name,
      meetingTypeId: meetingType.id,
      durationMin: slots.durationMin,
      locationMode: meetingType.locationMode,
      kind: slots.kind,
      seatsByStart: slots.seatsByStart ?? null,
      days: slots.days,
    });
  } catch (err) {
    console.error('[public/interview-booking/slots] failed:', err);
    return NextResponse.json(
      { error: 'Could not load available times. Please try again.' },
      { status: 500 },
    );
  }
}
