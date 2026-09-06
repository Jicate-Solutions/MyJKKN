// =====================================================================
// Accreditation — Teaching & Facilities evidence snapshots (Wave 2B)
// =====================================================================
// Refreshes the per-institution per-AY NAAC evidence snapshots via
// fn_facility_teaching_naac_snapshot_refresh():
//   5.1.1  lesson-plan / pedagogy-tagging coverage (curriculum_lesson spine)
//   3.1.1  facilities in daily use (resource registry + campus living modules)
//   3.4.1  IT infrastructure & learner:computer ratio (resource registry —
//          IMS categories carry no computing items, honestly skipped)
// Each snapshot row fans out to quality_evidence_mappings on the junction's
// natural key (source_table, source_id, body_code, metric_code), is_auto=true;
// manually-curated (is_auto=false) mappings are never clobbered. Fully
// idempotent — re-running refreshes the same rows. Counts only — no faculty
// or learner identities in metadata.
//
// Fired daily (04:37 IST) by the AI-routine dispatcher (ai_routine_schedules
// row 'facility-teaching-naac-snapshots' — day/time editable in
// /admin/ai-routines), NOT a raw vercel.json cron. Response spreads the fn's
// jsonb summary; the numeric 'count' key is on the dispatcher's summarize()
// allowlist so the Control Tower's "last run" line shows the total upserted.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude. Created 2026-07-26 (Wave 2B, module→evidence-spine).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Bearer ONLY — no ?secret= branch (a query-param secret lands in access
// logs / Referer headers). Compare is constant-time. Same pattern as
// app/api/cron/accreditation-loop-evidence/route.ts.
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

  const { data, error } = await supabase.rpc('fn_facility_teaching_naac_snapshot_refresh');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // fn returns {"ay": "...", "snap_5_1_1": n, "snap_3_1_1": n, "snap_3_4_1": n,
  // "mappings": n, "count": total} — spread so the dispatcher records it.
  const summary = (data ?? {}) as Record<string, number>;
  return NextResponse.json({ ok: true, ...summary });
}
