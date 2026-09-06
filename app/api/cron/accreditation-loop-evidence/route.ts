// =====================================================================
// Accreditation — loop→AQAR evidence rollup (IQAC bridge, PR 1/2)
// =====================================================================
// Turns every MEASURED self-improving-loop cycle into a NAAC Metric-7.3
// "Quality Assurance System" quality_evidence_mappings row (Binary Accreditation
// Framework 2024, Attribute 7: Governance; legacy: maps to Criterion 6.5 (IQAC)
// under the outgoing framework) via fn_accreditation_rollup_loop_evidence():
//   scf_ai_suggestions (session_feedback)  → 7.3.f  loop_key 'scf_teaching'
//   induction_session_effectiveness        → 7.3.d  loop_key 'induction_session'
//   scf_ai_suggestions (induction)         → 7.3.d  loop_key 'induction_playbook'
//   mess_menu_recommendations              → 7.3.f  loop_key 'mess_menu'
// Idempotent by construction: the fn upserts on the junction's natural key
// (source_table, source_id, body_code, metric_code), refreshing metadata +
// mapped_at, and never clobbers manually-curated (is_auto=false) mappings.
// Safe to re-run any time.
//
// Fired daily (04:23 IST) by the AI-routine dispatcher (ai_routine_schedules
// row 'accreditation-loop-evidence' — day/time editable in /admin/ai-routines),
// NOT a raw vercel.json cron. Response spreads the fn's jsonb summary; the
// numeric 'count' key is on the dispatcher's summarize() allowlist so the
// Control Tower's "last run" line shows the total upserted.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude. Created 2026-07-09 (loop→AQAR bridge PR 1/2).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// deep-review 2026-07-09 MEDIUM (consensus): Bearer ONLY — no ?secret= branch.
// A query-param secret lands in access logs / Referer headers (persistent
// disclosure); the dispatcher already invokes with `authorization: Bearer`
// (ai-routine-dispatcher route.ts:110), so nothing legitimate uses the param.
// Compare is constant-time.
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

  const { data, error } = await supabase.rpc('fn_accreditation_rollup_loop_evidence');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // fn returns {"scf_teaching": n, "induction_session": n, "induction_playbook": n,
  // "mess_menu": n, "count": total} — spread so the dispatcher records it.
  const summary = (data ?? {}) as Record<string, number>;
  return NextResponse.json({ ok: true, ...summary });
}
