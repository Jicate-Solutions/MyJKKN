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
// One set-based SQL aggregate (get_ai_model_usage_summary) — the previous
// row-fetch + JS rollup was silently truncated at the PostgREST 10k-row cap
// (.limit(50000) does not lift it), which under-counted every model once the
// window exceeded 10k invocations (ai_model_usage holds ~242k rows in prod).
// RBAC: super_admin only — checked server-side (same shape as the per-feature
// usage route), and the RPC is SECURITY INVOKER so the table's
// ai_model_usage_read_super_admin RLS policy still applies inside it.

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

    // ONE set-based SQL aggregate over the full window — the old row-fetch
    // (.limit(50000)) was silently capped at 10,000 rows by PostgREST, so any
    // window with more than 10k invocations under-counted every model. The
    // RPC returns rows already in the response shape, sorted by calls desc.
    const { data, error } = await auth.supabase.rpc('get_ai_model_usage_summary', {
      p_since: since.toISOString(),
    });

    if (error) {
      console.error('[ai-models/usage-summary] read error:', error);
      return NextResponse.json({ error: 'Failed to load usage summary' }, { status: 500 });
    }

    const rows: UsageByModelRow[] = Array.isArray(data) ? (data as UsageByModelRow[]) : [];

    return NextResponse.json({ data: rows, period });
  } catch (error) {
    console.error('[ai-models/usage-summary] GET error:', error);
    return NextResponse.json({ error: 'Failed to load usage summary' }, { status: 500 });
  }
}
