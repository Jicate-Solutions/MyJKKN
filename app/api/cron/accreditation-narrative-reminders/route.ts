// =====================================================================
// Accreditation narrative reminders + escalation — daily cron
// =====================================================================
// Nudges the owning Senior Learner of a draft that has been waiting on them
// for a few days, and escalates a long-overdue draft to super-admin oversight.
// All the work is in the SECURITY DEFINER RPC fn_accreditation_narrative_reminders
// (service_role only), which writes notifications + user_notifications directly
// and is idempotent per draft per day, so this cron can run repeatedly.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron sends it
// automatically) OR `?secret=` for manual runs. Does not call Claude.
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

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('fn_accreditation_narrative_reminders', {
    p_nudge_days: 3,
    p_escalate_days: 7,
  });
  if (error) {
    console.error('[accred-narrative-reminders] failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
