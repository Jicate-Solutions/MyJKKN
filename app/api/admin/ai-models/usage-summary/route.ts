export const dynamic = 'force-dynamic';

// /api/admin/ai-models/usage-summary
// GET — roll up ai_model_usage per (provider, model_id) over a rolling window.
//
// Query params:
//   ?period=hour|day|week   (default 'day')
//     hour → last 24 hours
//     day  → last 7 days
//     week → last 8 weeks
//
// Returns:
//   {
//     data: [
//       { provider, model_id, calls, tokens (input+output), cost_inr, last_used }
//     ],   // sorted by calls desc
//     period
//   }
//
// One query + in-memory aggregation, mirroring the GET list route's usage
// rollup. RBAC: super_admin only — checked server-side (same shape as the
// per-feature usage route).

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

type Period = 'hour' | 'day' | 'week';

const WINDOW_MS: Record<Period, number> = {
  hour: 24 * 60 * 60 * 1000, // last 24 hours
  day: 7 * 24 * 60 * 60 * 1000, // last 7 days
  week: 8 * 7 * 24 * 60 * 60 * 1000, // last 8 weeks
};

interface UsageByModelRow {
  provider: string;
  model_id: string;
  calls: number;
  tokens: number;
  cost_inr: number;
  last_used: string | null;
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
    const raw = url.searchParams.get('period');
    const period: Period = raw === 'hour' || raw === 'week' ? raw : 'day';
    const since = new Date(Date.now() - WINDOW_MS[period]);

    // Pull the window in one query, aggregate in memory. Explicit high cap
    // (this spans ALL features over up to 8 weeks, unlike the per-feature usage
    // route) so a busy window is not silently truncated to the PostgREST
    // default page size.
    const { data: rows, error } = await auth.supabase
      .from('ai_model_usage')
      .select('provider, model_id, input_tokens, output_tokens, cost_inr, success, invoked_at')
      .gte('invoked_at', since.toISOString())
      .limit(50000);

    if (error) {
      console.error('[ai-models/usage-summary] read error:', error);
      return NextResponse.json({ error: 'Failed to load usage summary' }, { status: 500 });
    }

    const agg = new Map<string, UsageByModelRow>();
    for (const row of rows ?? []) {
      const provider = (row.provider as string) ?? 'unknown';
      const modelId = (row.model_id as string) ?? 'unknown';
      const key = `${provider}|${modelId}`;
      const tokens = Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0);
      const cost = Number(row.cost_inr ?? 0);
      const invokedAt = (row.invoked_at as string | null) ?? null;

      const a =
        agg.get(key) ??
        { provider, model_id: modelId, calls: 0, tokens: 0, cost_inr: 0, last_used: null };
      a.calls += 1;
      a.tokens += Number.isFinite(tokens) ? tokens : 0;
      a.cost_inr += Number.isFinite(cost) ? cost : 0;
      if (invokedAt && (a.last_used === null || invokedAt > a.last_used)) {
        a.last_used = invokedAt;
      }
      agg.set(key, a);
    }

    const data = Array.from(agg.values()).sort((a, b) => b.calls - a.calls);

    return NextResponse.json({ data, period });
  } catch (error) {
    console.error('[ai-models/usage-summary] GET error:', error);
    return NextResponse.json({ error: 'Failed to load usage summary' }, { status: 500 });
  }
}
