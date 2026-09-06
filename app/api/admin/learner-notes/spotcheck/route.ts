// ============================================================================
// Learner-notes AUTO-PUBLISH spot-check — random sample of judge-published notes
// ============================================================================
// GET ?limit=N → a random sample (1–50, default 10) of scf_learner_notes that
//   the grounded safety judge AUTO-PUBLISHED (status='approved' AND the note's
//   judgement row has auto_approved=true), via fn_scf_auto_published_spotcheck.
//
// WHY THIS EXISTS: the enforcing judge publishes 'auto_safe' notes to learners
//   without a human in the loop. Its auto_safe PRECISION is unmeasured (0 human
//   labels), so a person must periodically eyeball a random sample — the safety
//   net over the auto-publish decision. This route is read-only: it never
//   changes a note's status. Pulling an unsafe note back is done from the
//   approval queue / enforce loop, not here.
//
// The RPC enforces is_super_admin() server-side and runs under the caller's
// Supabase session, so it sees the real auth.uid(). No learner identity is
// returned — the review is of note QUALITY, not of who received it.
// Pattern mirrors app/api/admin/learner-notes/route.ts.
// ============================================================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  await connection();
  const supabase = await createClient();

  // Clamp to the RPC's own bounds (1–50); default 10. A bad ?limit is ignored.
  const raw = Number(request.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.trunc(raw))) : 10;

  const { data, error } = await supabase.rpc('fn_scf_auto_published_spotcheck', {
    p_limit: limit,
  });
  if (error) {
    const status = error.message.includes('not authorized') ? 403 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, limit, notes: data ?? [] });
}
