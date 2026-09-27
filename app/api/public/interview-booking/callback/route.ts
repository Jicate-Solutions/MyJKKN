// app/api/public/interview-booking/callback/route.ts
// POST — "ask the office to call me" when the booking link shows no times (#14).
// PUBLIC (no auth).
//
// No times showing does not mean the diary is full: the slot engine fails
// closed when Google does not answer, and the two look identical from here.
// So the page never says "we're full" — it offers this instead, and the office
// rings the person. A later booking for the same post closes the request on
// its own (recordInterviewBooking).
//
// Same guards as the book route: per-IP limit (skipped for active staff, #1),
// honeypot, and the post re-read so a closed post cannot collect requests.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCallbackRequest,
  getBookablePost,
} from '@/lib/services/hr/interview-booking-service';
import { loadActiveStaffBooker } from '../book/active-staff';

export const dynamic = 'force-dynamic';

// A cap against flooding the office's call list, sized so it cannot bite a
// walk-in drive: every phone on one campus Wi-Fi shares one public IP, and on a
// day with no free times each of them may ask to be called (#14). 30 an hour per
// IP; staff are exempt (#1). Revealing nothing, this route needs no tighter one.
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

// "*" and "%" are refused: the address is matched with a PostgREST ilike, where
// "*" is a wildcard that cannot be escaped (review finding, 2026-09-24).
const EMAIL_RE = /^[^\s@*%]+@[^\s@*%]+\.[^\s@*%]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (body.honeypot) {
      // Spam bot — pretend success without creating anything.
      return NextResponse.json({ success: true });
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : '';
    const rawEmail = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';

    if (!name) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: 'A phone number is required.' }, { status: 400 });
    }
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json({ error: 'Please choose the post.' }, { status: 400 });
    }
    // Email is optional here — the office calls. A malformed one is dropped
    // rather than refused, so a typo cannot cost the person their call.
    const email = EMAIL_RE.test(rawEmail) ? rawEmail : null;

    const post = await getBookablePost(supabase, jobId);
    if (!post) {
      return NextResponse.json({ error: 'post_closed' }, { status: 409 });
    }

    const created = await createCallbackRequest(supabase, {
      post: { id: post.id, title: post.title, institution_id: post.institution_id },
      name,
      phone,
      email,
    });
    if (created.success === false) {
      console.error('[public/interview-booking/callback] insert failed:', created.error);
      return NextResponse.json(
        { error: 'Could not send your request. Please try again.' },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[public/interview-booking/callback] failed:', err);
    return NextResponse.json(
      { error: 'Could not send your request. Please try again.' },
      { status: 500 },
    );
  }
}
