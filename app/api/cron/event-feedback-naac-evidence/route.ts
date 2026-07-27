// =====================================================================
// Accreditation — Event feedback → NAAC 7.3.f satisfaction evidence
// =====================================================================
// Recomputes one event_feedback_naac_evidence snapshot per institution
// per academic year from the three event feedback channels
// (event_session_feedback + event_day_feedback + event_program_feedback)
// and upserts the matching quality_evidence_mappings rows via
// fn_event_feedback_refresh_naac_evidence():
//   7.3.f  Quality Assurance System — periodic stakeholder satisfaction
//          survey with feedback provided (Attribute 7, Governance)
//
// K-anonymous by construction (k=5): counts and mean ratings only, no
// rating-derived statistic below 5 responses, and never a free-text
// comment or a learner identity. An institution with no feedback gets no
// snapshot and no evidence row; a snapshot whose source rows vanish is
// zeroed and its auto mapping withdrawn.
//
// Idempotent by construction: snapshots upsert on (institution_id,
// academic_year); mappings upsert on the junction's natural key
// (source_table, source_id, body_code, metric_code), refreshing metadata
// + mapped_at, never clobbering manually-curated (is_auto=false)
// mappings. Safe to re-run any time.
//
// Fired daily (05:19 IST) by the AI-routine dispatcher (ai_routine_schedules
// row 'event-feedback-naac-evidence' — day/time editable in
// /admin/ai-routines), NOT a raw vercel.json cron. Response spreads the fn's
// jsonb summary; the numeric 'count' key is on the dispatcher's summarize()
// allowlist.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude. Created 2026-07-26.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Bearer ONLY — no ?secret= branch (query-param secrets land in access logs;
// same posture as hr-naac-evidence). Compare is constant-time.
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

  const { data, error } = await supabase.rpc('fn_event_feedback_refresh_naac_evidence');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // fn returns {"snapshots": n, "zeroed": n, "withdrawn": n, "mapped_7_3_f": n,
  // "k_threshold": 5, "count": total} — spread so the dispatcher records it.
  const summary = (data ?? {}) as Record<string, number | string>;
  return NextResponse.json({ ok: true, ...summary });
}
