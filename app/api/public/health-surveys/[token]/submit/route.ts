// app/api/public/health-surveys/[token]/submit/route.ts
//
// PUBLIC, no-login submit for a Wellness Survey (/ws/<token>).
// The unguessable public_token is the only key. The write goes through
// fn_health_survey_submit_public (service_role only), which checks the survey
// is active + open to 'public', validates name / email / mobile and every
// answer, scores server-side and enforces ONE submission per email.
//
// Pattern: app/api/public/health-programs/[token]/track/route.ts (public,
// IP rate limit, service-role, token-only auth).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
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

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const answers = body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return NextResponse.json({ error: 'Please answer every question' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase.rpc('fn_health_survey_submit_public', {
    p_token: token,
    p_name: str(body.name, 200),
    p_email: str(body.email, 320),
    p_mobile: str(body.mobile, 20),
    p_answers: answers,
    p_language: str(body.language, 5) || 'en',
  });

  if (error) {
    // 23505 = already submitted; 22023 = validation (messages are user-facing,
    // raised by the RPC). Anything else stays opaque on a public route.
    if (error.code === '23505' || error.code === '22023') {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === '23505' ? 409 : 400 },
      );
    }
    console.error('[public survey submit]', error);
    return NextResponse.json({ error: 'Could not submit the survey' }, { status: 500 });
  }

  const row = data as { constructive_count: number; total_questions: number };
  return NextResponse.json({
    success: true,
    constructive_count: row.constructive_count,
    total_questions: row.total_questions,
  });
}
