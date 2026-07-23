// app/api/public/poll/[slug]/vote/route.ts
// POST — record an invitee's vote on a meeting poll. PUBLIC (no auth) —
// powers /poll/[slug] (Universal Booking M5).
//
// The vote is cast via fn_cast_poll_votes (SECURITY DEFINER, anon-granted),
// which validates the poll is open, filters option ids to those belonging to
// the poll, and replaces the voter's prior ballot. Rate-limited + honeypot
// like the booking routes.
//
// Pattern: app/api/public/meet/[handle]/[typeSlug]/book/route.ts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        { error: 'Too many votes. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (body.honeypot) {
      // Spam bot — pretend success without recording anything.
      return NextResponse.json({ success: true, recorded: 0 });
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
    const optionIds: string[] = Array.isArray(body.optionIds)
      ? body.optionIds.filter((v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v))
      : [];

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    if (optionIds.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one time.' },
        { status: 400 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await supabase.rpc('fn_cast_poll_votes', {
      p_slug: slug,
      p_voter_name: name,
      p_voter_email: email,
      p_option_ids: optionIds,
    });

    if (error) {
      // P0002 = poll not found; 22023 = closed/invalid input. Both map to a
      // friendly message without leaking which it was beyond the obvious.
      if (error.code === 'P0002') {
        return NextResponse.json({ error: 'This poll was not found.' }, { status: 404 });
      }
      if (error.message?.toLowerCase().includes('closed')) {
        return NextResponse.json(
          { error: 'This poll has closed — voting is no longer open.' },
          { status: 409 },
        );
      }
      console.error('[public/poll/vote] rpc failed:', error.message);
      return NextResponse.json(
        { error: 'Could not record your vote. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, recorded: Number(data) || 0 });
  } catch (err) {
    console.error('[public/poll/vote] failed:', err);
    return NextResponse.json(
      { error: 'Could not record your vote. Please try again.' },
      { status: 500 },
    );
  }
}
