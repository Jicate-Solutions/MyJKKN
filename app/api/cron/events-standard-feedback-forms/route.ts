// =====================================================================
// Events — open the standard feedback form on every event that has ended
// =====================================================================
// Director's ruling, 2026-09-13: "Yes — every event, asked after it ends."
//
// Calls fn_events_open_standard_feedback(), which writes ONE standard short
// form (fixed question_keys, so answers are comparable across every event) on
// each event that:
//   · has ENDED inside the lookback window (the later of events.end_date and
//     events.event_date + end_time in IST — those two columns can disagree),
//   · is not draft or cancelled,
//   · is not an induction programme (induction runs its own three channels), and
//   · has no feedback form of its own — a coordinator's hand-built form is never
//     second-guessed and nobody is asked twice.
//
// SENDS NOTHING. No notification, no email, no push. It writes form / section /
// question rows and returns counts. Attendees find the form themselves at
// /learners/my-event-feedback, which reads fn_my_pending_event_feedback().
//
// Idempotent by construction: the NOT EXISTS on event_feedback_forms means a
// second run the same day creates nothing, so a manual trigger is safe.
//
// Fired daily (06:45 IST) by the AI-routine dispatcher (ai_routine_schedules row
// 'events-standard-feedback-forms' — day/time editable in /admin/ai-routines),
// NOT a raw vercel.json cron. Response spreads the fn's jsonb summary; the
// numeric 'count' key is on the dispatcher's summarize() allowlist.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude. Created 2026-09-13.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Bearer ONLY — no ?secret= branch (query-param secrets land in access logs;
// same posture as event-feedback-naac-evidence). Compare is constant-time.
function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || !bearerMatches(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc('fn_events_open_standard_feedback');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // fn returns {"ok": true, "events_eligible": n, "forms_created": n,
  // "lookback_days": n, "open_days": n, "count": n} — spread so the dispatcher
  // records the summary.
  const summary = (data ?? {}) as Record<string, number | string | boolean>;
  return NextResponse.json({ ok: true, ...summary });
}
