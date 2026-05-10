export const dynamic = 'force-dynamic';

// /api/admin/lead-stages-policy/counts
// Phase 1C: Live lead counts per funnel_stage — used by the admin UI's
// "leads currently in this stage" column.
// RBAC: super_admin only — checked server-side.
//
// GET — SELECT funnel_stage, count(*) FROM admission_leads GROUP BY funnel_stage

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'super_admin') return { ok: false as const, status: 403 };
  return { ok: true as const, supabase, userId: user.id };
}

export async function GET(_request: NextRequest) {
  await connection();
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    // Group admission_leads by funnel_stage and count live rows.
    // PostgREST doesn't expose GROUP BY natively, so we use the RPC pattern
    // via a raw query through the service-role client to bypass any RLS
    // interference — auth check above already validated super_admin.
    // Supabase JS v2: .from().select() with count only gives total count.
    // We use a stored procedure workaround via rpc if available, otherwise
    // fall back to a JS-side aggregation from a full select of just the column.
    //
    // Preferred: fetch only funnel_stage column and aggregate in JS.
    // This avoids needing a DB function and stays within the anon-key client.
    const { data: leads, error } = await auth.supabase
      .from('admission_leads')
      .select('funnel_stage');

    if (error) throw error;

    // Aggregate counts in JS — O(n) single pass
    const countMap: Record<string, number> = {};
    for (const row of leads ?? []) {
      const stage = (row.funnel_stage as string | null) ?? '__unknown__';
      countMap[stage] = (countMap[stage] ?? 0) + 1;
    }

    const data = Object.entries(countMap)
      .map(([funnel_stage, count]) => ({ funnel_stage, count }))
      .sort((a, b) => a.funnel_stage.localeCompare(b.funnel_stage));

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[lead-stages-policy/counts] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch lead stage counts' }, { status: 500 });
  }
}
