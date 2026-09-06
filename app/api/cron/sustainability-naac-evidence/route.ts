// =====================================================================
// Accreditation — Sustainability evidence snapshots (Attribute 10)
// =====================================================================
// Recomputes one sustainability_naac_evidence snapshot per institution
// THAT REPORTED METER READINGS in the current academic year, then upserts
// the matching quality_evidence_mappings rows via
// fn_sustainability_refresh_naac_evidence():
//   10.2  water & waste management
//   10.3  progressing towards net zero (direction, not a snapshot)
// NAAC 10.4 (green audits) is NOT emitted here — it comes from the audit
// module: a closed audit_cycles row with module_key='sustainability' emits
// it through fn_sync_audit_cycle_evidence's trigger fan-out.
//
// Honest gating — an institution with no readings produces NO snapshot and
// NO evidence row, never a fabricated zero. 10.2/10.3 stay dark until the
// reading series is long enough (platform_policies
// 'sustainability.min_months_for_trend', default 2) and, for 10.3, a
// direction is actually computable. The response's 'skipped_thin' key is
// how many metric slots were withheld for insufficient data — expect it to
// be high in the first months of entry; that is correct, not a failure.
//
// Idempotent by construction: snapshots upsert on (institution_id,
// academic_year); mappings upsert on the junction's natural key
// (source_table, source_id, body_code, metric_code), refreshing metadata +
// mapped_at, never clobbering manually-curated (is_auto=false) mappings.
// Safe to re-run any time.
//
// Fired daily (05:05 IST) by the AI-routine dispatcher (ai_routine_schedules
// row 'sustainability-naac-evidence' — day/time editable in
// /admin/ai-routines), NOT a raw vercel.json cron. Response spreads the fn's
// jsonb summary; the numeric 'count' key is on the dispatcher's summarize()
// allowlist.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude. Created 2026-07-26 (Attribute 10 green substrate).

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

  const { data, error } = await supabase.rpc('fn_sustainability_refresh_naac_evidence');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // fn returns {"academic_year": "...", "snapshots": n, "water_waste_10_2": n,
  // "net_zero_10_3": n, "withdrawn": n, "skipped_thin": n, "count": total}
  // — spread so the dispatcher records it.
  const summary = (data ?? {}) as Record<string, number | string>;
  return NextResponse.json({ ok: true, ...summary });
}
