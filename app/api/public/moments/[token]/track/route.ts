// app/api/public/moments/[token]/track/route.ts
//
// PUBLIC engagement tracking for Family Moments gift pages.
// POST { event: 'install_click' | 'push_subscribed' }
//
// The unguessable token is the only auth (same trust model as the page).
// Writes use the service role — family_moments has NO anon policies.
// Page opens are NOT tracked here (the server component records them);
// this route only stamps install/push milestones.
//
// Pattern: app/api/public/booking/[slug]/book/route.ts (in-memory IP
// rate limit on a public, unauthenticated route).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

const ALLOWED_EVENTS = ['install_click', 'push_subscribed'] as const;
type TrackEvent = (typeof ALLOWED_EVENTS)[number];

const EVENT_COLUMN: Record<TrackEvent, string> = {
  install_click: 'install_clicked_at',
  push_subscribed: 'push_subscribed_at',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let event: string | undefined;
  try {
    const body = await request.json();
    event = body?.event;
  } catch {
    // fall through to validation
  }
  if (!event || !ALLOWED_EVENTS.includes(event as TrackEvent)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const column = EVENT_COLUMN[event as TrackEvent];
  // Stamp only the FIRST occurrence — repeat taps don't move the timestamp.
  const { error } = await supabase
    .from('family_moments')
    .update({ [column]: new Date().toISOString() })
    .eq('token', token)
    .is(column, null);

  if (error) {
    // Tracking must never surface DB internals on a public route.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
