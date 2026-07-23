// app/api/public/meet/[handle]/[typeSlug]/book/route.ts
// POST — confirm a booking on one host's meeting type. PUBLIC (no auth) —
// powers /meet/[handle] (Universal Booking U4, instant confirm per D2).
//
// The client-supplied meetingTypeId is RE-RESOLVED server-side from
// handle+typeSlug — a malicious client cannot substitute another host's type.
// createBooking re-validates the slot against the engine; the gist exclusion
// constraint arbitrates concurrent races (23P01 → SLOT_TAKEN).
//
// Pattern: app/api/public/booking/[slug]/book/route.ts (rate limit + honeypot).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PublicHostService } from '@/lib/services/meetings/public-host-service';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';
import { BookingIdentityService } from '@/lib/services/meetings/booking-identity-service';
import {
  createBookingOrder,
  isRazorpayBookingConfigured,
  verifyBookingPayment,
} from '@/lib/services/integrations/razorpay-booking-service';

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
  { params }: { params: Promise<{ handle: string; typeSlug: string }> },
) {
  try {
    const { handle, typeSlug } = await params;

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

    // Wave-3 (B): 'order' = create a Razorpay deposit order before Checkout;
    // default = confirm the booking (free, or paid with a verified payment).
    const mode = body.mode === 'order' ? 'order' : 'confirm';

    const start = typeof body.start === 'string' ? body.start : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

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

    const host = await PublicHostService.resolveBookableHost(supabase, handle);
    if (!host) {
      return NextResponse.json({ error: 'Booking page not found' }, { status: 404 });
    }
    const mt = host.meetingTypes.find((t) => t.slug === typeSlug);
    if (!mt) {
      return NextResponse.json({ error: 'Meeting type not found' }, { status: 404 });
    }

    // Identity gate (Director 2026-06-20): a signed-in user books as themselves
    // (binds attendee_profile_id); a JKKN-account email must log in first;
    // everyone else books as a guest. Enforced server-side — never trusted from
    // the client. The 403 carries a loginUrl that returns here after sign-in.
    // Runs BEFORE the deposit/order step so a user who must log in is never
    // sent to a Razorpay order.
    const identity = await BookingIdentityService.resolve(supabase, email);
    if (identity.kind === 'login_required') {
      return NextResponse.json(
        {
          error: 'login_required',
          reason: identity.reason,
          loginUrl: `/auth/login?redirectedFrom=${encodeURIComponent(`/meet/${handle}`)}`,
        },
        { status: 403 },
      );
    }
    const attendeeName = identity.kind === 'authenticated' ? identity.name : name;
    const attendeeEmail = identity.kind === 'authenticated' ? identity.email : email;
    const attendeeProfileId = identity.kind === 'authenticated' ? identity.profileId : null;

    // Re-resolve the deposit requirement server-side (never trust the client).
    const fullType = await NativeSchedulingService.getMeetingType(supabase, mt.id);
    if (!fullType) {
      return NextResponse.json({ error: 'Meeting type not found' }, { status: 404 });
    }
    const depositActive =
      !!fullType.requires_deposit &&
      (fullType.deposit_amount_paise ?? 0) > 0 &&
      isRazorpayBookingConfigured();
    const depositPaise = depositActive ? fullType.deposit_amount_paise! : 0;

    // ── Step 1 (deposit types only): create the Razorpay order ─────────────────
    if (mode === 'order') {
      if (!depositActive) {
        // No deposit needed (free type, or required-but-Razorpay-unconfigured →
        // degrade to free). Tell the widget to skip Checkout.
        return NextResponse.json({ success: true, requiresPayment: false });
      }
      const order = await createBookingOrder({
        amountPaise: depositPaise,
        receipt: `booking-${Date.now().toString(36)}`,
        notes: { handle, typeSlug, attendee_email: email },
      });
      if (!order) {
        return NextResponse.json(
          { error: 'Could not start payment. Please try again.' },
          { status: 502 },
        );
      }
      return NextResponse.json({
        success: true,
        requiresPayment: true,
        orderId: order.orderId,
        amountPaise: order.amountPaise,
        keyId: order.keyId,
      });
    }

    // ── Step 2 (confirm): for a deposit type, verify the payment FIRST ─────────
    let verifiedPayment: { orderId: string; paymentId: string } | undefined;
    if (depositActive) {
      const orderId = typeof body.razorpayOrderId === 'string' ? body.razorpayOrderId : '';
      const paymentId = typeof body.razorpayPaymentId === 'string' ? body.razorpayPaymentId : '';
      const signature = typeof body.razorpaySignature === 'string' ? body.razorpaySignature : '';
      if (!orderId || !paymentId || !signature) {
        return NextResponse.json({ error: 'payment_required' }, { status: 402 });
      }
      const ok = verifyBookingPayment({ orderId, paymentId, signature });
      if (!ok) {
        return NextResponse.json({ error: 'payment_unverified' }, { status: 402 });
      }
      verifiedPayment = { orderId, paymentId };
    }

    const booking = await NativeSchedulingService.createBooking(supabase, {
      meetingTypeId: mt.id,
      start,
      attendeeName,
      attendeeEmail,
      attendeePhone: phone || null,
      attendeeProfileId,
      answers: note ? { note } : {},
      source: 'meet-page',
      payment: verifiedPayment,
    });
    if (!booking.success) {
      if (booking.error === 'SLOT_TAKEN' || booking.error === 'INVALID_SLOT') {
        return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
      }
      // PR2: the meeting type's room is already reserved for this slot.
      if (booking.error === 'VENUE_TAKEN') {
        return NextResponse.json({ error: 'venue_taken' }, { status: 409 });
      }
      if (booking.error === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Booking page not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Could not complete the booking. Please try again.' },
        { status: 500 },
      );
    }

    // Wave-3 lifecycle: if this meeting type defines a post-booking redirect,
    // hand it back so the widget can send the booker there instead of showing
    // the default confirmation stub. Read the column directly (PublicHostService
    // does not surface it); cast untyped — redirect_url isn't in generated types.
    let redirectUrl: string | null = null;
    const { data: lifecycle } = await (supabase as any)
      .from('meeting_types')
      .select('redirect_url')
      .eq('id', mt.id)
      .maybeSingle();
    const candidate = String((lifecycle?.redirect_url as string | null) ?? '').trim();
    // Only honour safe absolute http(s) or root-relative paths (no javascript:, etc.).
    if (/^https?:\/\//i.test(candidate) || /^\/[^/]/.test(candidate)) {
      redirectUrl = candidate;
    }

    // Wave-3 (A): surface the video link (Google Meet / Zoom / Teams) minted by
    // createBooking so the confirmation can show "Join" right away. NULL when
    // the type isn't online or no provider was configured (link only emailed).
    let videoUrl: string | null = null;
    const { data: bookingRow } = await (supabase as any)
      .from('meeting_bookings')
      .select('video_url')
      .eq('uid', booking.uid)
      .maybeSingle();
    const vu = String((bookingRow?.video_url as string | null) ?? '').trim();
    if (/^https?:\/\//i.test(vu)) videoUrl = vu;

    return NextResponse.json({
      success: true,
      uid: booking.uid,
      start: booking.start,
      hostName: host.name,
      durationMin: mt.durationMin,
      redirectUrl,
      videoUrl,
      // PR2: 'pending' = room held but awaiting caretaker approval; 'confirmed'
      // = room held; null = no room reservation (walk-in / custom / online).
      venueStatus: booking.venueStatus,
    });
  } catch (err) {
    console.error('[public/meet/book] failed:', err);
    return NextResponse.json(
      { error: 'Could not complete the booking. Please try again.' },
      { status: 500 },
    );
  }
}
