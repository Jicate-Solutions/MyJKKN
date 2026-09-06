export const dynamic = 'force-dynamic';

// /api/admin/ai-models/switches
// GET — recent model-switch evaluations for the Feature A auto-compare loop.
//
// Returns each switch the Director made (fn_ai_job_type_set_model opened it) with
// its rolling old-vs-new tally and — once enough comparisons land — a conservative
// verdict. Recommendation-only: a 'new_worse' verdict WARNS; nothing auto-reverts.
//
// Returns:
//   { data: [{ id, job_type, old_model_id, new_model_id, switched_at, status,
//              comparisons_done, comparisons_target, new_wins, old_wins, ties,
//              verdict, verdict_at, in_flight }] }
//
// RBAC: super_admin only. Reads via the authenticated client so the table's
// admin-read RLS applies (defense in depth on top of the role check).

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'super_admin') return { ok: false as const, status: 403 };
  return { ok: true as const, supabase, userId: user.id };
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const url = new URL(request.url);
    const limitParam = parseInt(url.searchParams.get('limit') ?? '25', 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 25 : limitParam, 1), 100);

    const { data: evals, error } = await auth.supabase
      .from('model_switch_evaluations')
      .select(
        'id, job_type, old_provider, old_model_id, new_provider, new_model_id, switched_at, status, comparisons_done, comparisons_target, new_wins, old_wins, ties, verdict, verdict_at',
      )
      .order('switched_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = evals ?? [];

    // In-flight replay/judge counts per switch (context for "collecting N/target").
    const inFlight = new Map<string, number>();
    if (rows.length > 0) {
      const { data: active } = await auth.supabase
        .from('model_switch_replays')
        .select('switch_id')
        .in(
          'switch_id',
          rows.map((r) => r.id),
        )
        .in('status', ['pending', 'replaying', 'judging']);
      for (const a of (active ?? []) as Array<{ switch_id: string }>) {
        inFlight.set(a.switch_id, (inFlight.get(a.switch_id) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      data: rows.map((r) => ({ ...r, in_flight: inFlight.get(r.id) ?? 0 })),
    });
  } catch (error) {
    console.error('[ai-models/switches] GET error:', error);
    return NextResponse.json({ error: 'Failed to load model switches' }, { status: 500 });
  }
}
