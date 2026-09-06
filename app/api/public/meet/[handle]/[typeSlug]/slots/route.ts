// app/api/public/meet/[handle]/[typeSlug]/slots/route.ts
// POST — live slots for one host's meeting type. PUBLIC (no auth) — powers
// /meet/[handle] (Universal Booking U4).
//
// The D20 gate (public + not hidden + active Google connection) is enforced
// by PublicHostService.resolveBookableHost; a failing host is a generic 404.
//
// Pattern: app/api/public/booking/[slug]/slots/route.ts (service-role client
// + in-memory IP rate limit).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PublicHostService } from '@/lib/services/meetings/public-host-service';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';
import { isRazorpayBookingConfigured } from '@/lib/services/integrations/razorpay-booking-service';

export const dynamic = 'force-dynamic';

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
  { params }: { params: Promise<{ handle: string; typeSlug: string }> },
) {
  try {
    const { handle, typeSlug } = await params;

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const host = await PublicHostService.resolveBookableHost(supabase, handle);
    if (!host) {
      return NextResponse.json({ error: 'Booking page not found' }, { status: 404 });
    }
    const mt = host.meetingTypes.find((t) => t.slug === typeSlug);
    if (!mt) {
      return NextResponse.json({ error: 'Meeting type not found' }, { status: 404 });
    }

    const slots = await NativeSchedulingService.listSlots(supabase, mt.id, { days: 14 });
    if (!slots) {
      return NextResponse.json({ error: 'Meeting type not found' }, { status: 404 });
    }

    // Wave-3 (B): a deposit is only collectable when the type requires it AND
    // Razorpay is configured (env-gated). When required-but-unconfigured we
    // surface requiresDeposit:false so the widget falls back to a free booking
    // rather than dead-ending the booker (graceful degradation). The KEY_ID is
    // the public checkout key (safe in the browser), not the secret.
    const full = await NativeSchedulingService.getMeetingType(supabase, mt.id);
    const razorpayReady = isRazorpayBookingConfigured();
    const depositActive =
      !!full?.requires_deposit &&
      (full?.deposit_amount_paise ?? 0) > 0 &&
      razorpayReady;

    return NextResponse.json({
      hostName: host.name,
      meetingTypeId: mt.id,
      durationMin: slots.durationMin,
      locationMode: mt.locationMode,
      // Wave-3: variant kind + (group only) remaining seats per slot start.
      kind: slots.kind,
      seatsByStart: slots.seatsByStart ?? null,
      // Wave-3 (B): deposit requirement + public Razorpay key for Checkout.
      requiresDeposit: depositActive,
      depositAmountPaise: depositActive ? full!.deposit_amount_paise : null,
      razorpayKeyId: depositActive ? (process.env.RAZORPAY_KEY_ID ?? null) : null,
      days: slots.days,
    });
  } catch (err) {
    console.error('[public/meet/slots] failed:', err);
    return NextResponse.json(
      { error: 'Could not load available times. Please try again.' },
      { status: 500 },
    );
  }
}
