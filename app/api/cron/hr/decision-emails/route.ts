export const dynamic = 'force-dynamic';

// /api/cron/hr/decision-emails — every 5 minutes (vercel.json).
//
// Sends due applicant emails for leave, short time off and comp-off decisions
// (hr_decision_emails): retries after a failed send, and anything the
// right-after-the-decision send did not finish. Rows still unsent 3 days after
// the decision are marked failed by the claim function, never sent late.
//
// Auth: CRON_SECRET as `Authorization: Bearer <secret>` (Vercel cron) or
// `?secret=` (manual runs) — same shape as /api/cron/hr/document-expiry-reminders.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { HrDecisionEmailService } from '@/lib/services/hr/decision-email-service';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/hr/decision-emails] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await HrDecisionEmailService.flush({ limit: 100 });
  return NextResponse.json({ ok: true, ...result, duration_ms: Date.now() - startedAt });
}
