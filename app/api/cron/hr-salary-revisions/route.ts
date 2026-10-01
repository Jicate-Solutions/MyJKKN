// =====================================================================
// Salary revisions — the two scheduled jobs (20270519090000)
// =====================================================================
//   ?mode=apply   DAILY. Writes the new pay for every approved revision whose
//                 start date (the 1st of the month after the Director's yes)
//                 has come, through fn_hr_set_staff_salary. Nothing before
//                 that date, ever; running it twice writes nothing twice.
//   ?mode=digest  WEEKLY (ruling 11). One in-app reminder to the Director
//                 listing everything waiting. Nothing expires; nothing is
//                 approved by it.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron) or
// `?secret=` for a manual run — the same as the sibling cron routes. Runs as
// the service role: auth.uid() is NULL, which is what both functions require.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get('mode');
  const fn = mode === 'apply' ? 'fn_hr_salary_revision_apply_due'
    : mode === 'digest' ? 'fn_hr_salary_revision_weekly_digest'
    : null;
  if (!fn) {
    return NextResponse.json({ ok: false, error: 'mode must be apply or digest' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await (supabase as any).rpc(fn);
  if (error) {
    console.error(`[HR Salary Revisions cron] ${mode} failed:`, error);
    return NextResponse.json({ ok: false, mode, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode, count: data ?? 0 });
}
