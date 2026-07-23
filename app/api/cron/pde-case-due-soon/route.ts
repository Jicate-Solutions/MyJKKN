// =====================================================================
// PDE clinical-case "due tomorrow" reminder
// =====================================================================
// A learner gets one notification when a case is assigned. This cron adds the
// second half a deadline needs: a nudge the day BEFORE it is due (user decision
// 2026-07-23) for assigned learners who have not finished yet.
//
// Daily, morning IST. Computes tomorrow's IST date, asks fn_pde_due_soon_reminders
// for every assigned + enrolled + not-yet-completed learner whose case is due that
// day, and delivers one in-app nudge each. Idempotent via deliverInApp's
// idempotency_key (assessment + user + due-date) — safe to run more than once a day.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` or `?secret=`.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deliverInApp } from '@/lib/social/notify';

/** Tomorrow's date in IST as 'YYYY-MM-DD' (JKKN is India-only; +05:30, no DST). */
function tomorrowISO_IST(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000); // shift into IST wall-clock
  ist.setUTCDate(ist.getUTCDate() + 1);
  return ist.toISOString().slice(0, 10);
}

interface Recipient {
  assessment_id: string;
  case_title: string;
  user_id: string;
  due_at: string;
}

export async function GET(request: NextRequest) {
  const started = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const dueDate = tomorrowISO_IST();
  const result = {
    ok: true,
    due_date: dueDate,
    candidates: 0,
    delivered: 0,
    duplicate: 0,
    errors: 0,
    elapsed_ms: 0,
  };

  const { data: rows, error } = await admin.rpc('fn_pde_due_soon_reminders', { p_due_date: dueDate });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, due_date: dueDate }, { status: 500 });
  }
  const recipients = (Array.isArray(rows) ? rows : []) as Recipient[];
  result.candidates = recipients.length;

  for (const r of recipients) {
    const outcome = await deliverInApp(admin, {
      recipientId: r.user_id,
      title: 'A clinical case is due tomorrow ⏰',
      body: `"${r.case_title}" is due tomorrow. Open it and finish before the deadline.`,
      url: `/pde/learn/cases/${r.assessment_id}`,
      category: 'pde.case.due_soon',
      idempotencyKey: `pde-case-due-soon:${r.assessment_id}:${r.user_id}:${dueDate}`,
      metadata: {
        kind: 'pde_case_due_soon',
        assessment_id: r.assessment_id,
        due_at: r.due_at,
        due_date: dueDate,
      },
    });
    if (outcome === 'delivered') result.delivered++;
    else if (outcome === 'duplicate') result.duplicate++;
    else result.errors++;
  }

  result.elapsed_ms = Date.now() - started;
  return NextResponse.json(result);
}
