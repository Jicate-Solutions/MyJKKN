// app/api/public/health-programs/[token]/track/route.ts
//
// PUBLIC, no-login view tracking for the Wellness Program page (/p/<token>).
// POST — logs ONE anonymous view fact into health_program_views.
//
// The unguessable public_token is the only key (same trust model as the page).
// Writes use the service role — health_program_views has NO anon policies and
// anon is stripped of all grants. The client IP is salted-hashed (never stored
// raw), device_type is parsed from the UA. Always silent-fails to {success:true}
// so tracking can never break the patient-facing page or leak DB internals.
//
// Pattern: app/api/public/moments/[token]/track/route.ts (public, IP rate
// limit, service-role write, token-only auth).

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
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

function deviceTypeFromUA(ua: string): string {
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function hashIp(ip: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'jkkn-health-views';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // Silent-fail throughout: a tracking error must never surface to the visitor.
  try {
    if (!TOKEN_RE.test(token)) {
      return NextResponse.json({ success: true });
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (rateLimited(ip)) {
      return NextResponse.json({ success: true });
    }

    const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 500);
    const deviceType = deviceTypeFromUA(userAgent);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Resolve the program (and its current day, if one publishes today) from the
    // token. A missing program just yields a null program_id — we still log the
    // hit rather than reveal whether the token is valid.
    const { data: program } = await supabase
      .from('health_programs')
      .select('id')
      .eq('public_token', token)
      .maybeSingle();

    let dayId: string | null = null;
    if (program?.id) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: day } = await supabase
        .from('health_program_days')
        .select('id')
        .eq('program_id', program.id)
        .eq('publish_date', today)
        .maybeSingle();
      dayId = day?.id ?? null;
    }

    await supabase.from('health_program_views').insert({
      program_id: program?.id ?? null,
      day_id: dayId,
      public_token: token,
      ip_hash: hashIp(ip),
      user_agent: userAgent,
      device_type: deviceType,
    });

    return NextResponse.json({ success: true });
  } catch {
    // Never leak internals on a public route.
    return NextResponse.json({ success: true });
  }
}
