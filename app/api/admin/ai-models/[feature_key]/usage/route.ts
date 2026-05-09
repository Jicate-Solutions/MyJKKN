export const dynamic = 'force-dynamic';

// /api/admin/ai-models/[feature_key]/usage
// GET — usage history for one feature.
//
// Query params:
//   ?days=30 (default 30, max 90) — window
//
// Returns:
//   {
//     data: {
//       feature_key,
//       window_days,
//       total_invocations,
//       total_cost_inr,
//       success_rate,
//       avg_duration_ms,
//       daily: [{ day: '2026-05-09', invocations, cost_inr, success_count }],
//       audit: [{ changed_at, old_provider, old_model_id, new_provider, new_model_id, change_reason }]
//     }
//   }
//
// RBAC: super_admin only.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
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

type RouteContext = { params: Promise<{ feature_key: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  await connection();
  try {
    const { feature_key } = await context.params;
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const url = new URL(request.url);
    const daysParam = parseInt(url.searchParams.get('days') ?? '30', 10);
    const windowDays = Math.min(Math.max(isNaN(daysParam) ? 30 : daysParam, 1), 90);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // Pull usage rows in window
    const { data: usage, error: usageErr } = await auth.supabase
      .from('ai_model_usage')
      .select('cost_inr, duration_ms, success, invoked_at')
      .eq('feature_key', feature_key)
      .gte('invoked_at', since.toISOString())
      .order('invoked_at', { ascending: false })
      .limit(10000); // safety cap

    if (usageErr) throw usageErr;

    let totalCost = 0;
    let totalCount = 0;
    let successCount = 0;
    let durationSum = 0;
    let durationSamples = 0;
    const dailyMap = new Map<string, { invocations: number; cost_inr: number; success_count: number }>();

    for (const row of usage ?? []) {
      const cost = Number(row.cost_inr ?? 0);
      const success = row.success !== false;
      const duration = row.duration_ms ? Number(row.duration_ms) : null;
      const day = (row.invoked_at as string).slice(0, 10); // YYYY-MM-DD

      totalCost += cost;
      totalCount += 1;
      if (success) successCount += 1;
      if (duration !== null) {
        durationSum += duration;
        durationSamples += 1;
      }

      const cell = dailyMap.get(day) ?? { invocations: 0, cost_inr: 0, success_count: 0 };
      cell.invocations += 1;
      cell.cost_inr += cost;
      if (success) cell.success_count += 1;
      dailyMap.set(day, cell);
    }

    const daily = Array.from(dailyMap.entries())
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day));

    // Audit log entries for this feature
    const { data: auditRows, error: auditErr } = await auth.supabase
      .from('ai_model_config_audit')
      .select('changed_at, old_provider, old_model_id, new_provider, new_model_id, change_reason, changed_by')
      .eq('feature_key', feature_key)
      .order('changed_at', { ascending: false })
      .limit(50);

    if (auditErr) {
      console.error('[ai-models/usage] audit read error:', auditErr);
    }

    return NextResponse.json({
      data: {
        feature_key,
        window_days: windowDays,
        total_invocations: totalCount,
        total_cost_inr: totalCost,
        success_rate: totalCount > 0 ? successCount / totalCount : 1,
        avg_duration_ms: durationSamples > 0 ? Math.round(durationSum / durationSamples) : null,
        daily,
        audit: auditRows ?? [],
      },
    });
  } catch (error) {
    console.error('[ai-models/usage] GET error:', error);
    return NextResponse.json({ error: 'Failed to load usage history' }, { status: 500 });
  }
}
