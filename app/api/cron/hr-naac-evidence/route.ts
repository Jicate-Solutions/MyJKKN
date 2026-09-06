// =====================================================================
// Accreditation — HR evidence snapshots refresh (Wave 2A)
// =====================================================================
// Recomputes one hr_naac_evidence snapshot per institution (active
// teaching staff) for the current academic year and upserts the matching
// quality_evidence_mappings rows via fn_hr_refresh_naac_evidence():
//   2.1    faculty-learner ratio (FSR)
//   2.2.1  cadre strength vs sanctioned posts (only where a
//          sanctioned_posts register exists for that institution + AY)
//   2.2.2  faculty PhD %
//   2.2.3  avg teaching experience + cadre-level distribution
//   7.10.1 3-year faculty retention %
// Idempotent by construction: snapshots upsert on (institution_id,
// academic_year); mappings upsert on the junction's natural key
// (source_table, source_id, body_code, metric_code), refreshing metadata
// + mapped_at, never clobbering manually-curated (is_auto=false)
// mappings. Safe to re-run any time.
//
// Fired daily (04:37 IST) by the AI-routine dispatcher (ai_routine_schedules
// row 'hr-naac-evidence' — day/time editable in /admin/ai-routines), NOT a
// raw vercel.json cron. Response spreads the fn's jsonb summary; the numeric
// 'count' key is on the dispatcher's summarize() allowlist.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude. Created 2026-07-26 (Wave 2A HR evidence snapshots).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Bearer ONLY — no ?secret= branch (query-param secrets land in access logs;
// same posture as accreditation-loop-evidence). Compare is constant-time.
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

  const { data, error } = await supabase.rpc('fn_hr_refresh_naac_evidence');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // fn returns {"academic_year": "...", "snapshots": n, "fsr_2_1": n, ...,
  // "count": total} — spread so the dispatcher records it.
  const summary = (data ?? {}) as Record<string, number | string>;
  return NextResponse.json({ ok: true, ...summary });
}
