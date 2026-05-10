export const dynamic = 'force-dynamic';

// /api/admin/ai-models
// GET — list every AI feature row with current usage stats.
//
// Returns:
//   {
//     data: [
//       {
//         feature_key, display_name, description, category,
//         provider, model_id, fallback_provider, fallback_model_id,
//         monthly_spend_cap_inr, is_active, config_json,
//         updated_at, updated_by,
//         month_to_date_cost_inr, month_to_date_invocations, month_to_date_success_rate,
//         last_24h_cost_inr, last_24h_invocations
//       }
//     ]
//   }
//
// RBAC: super_admin only — checked server-side. RLS in migration is defense-in-depth.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listAllFeatures, type AiModelConfigRow } from '@/lib/services/platform/ai-model-config-service';

interface FeatureWithUsage extends AiModelConfigRow {
  month_to_date_cost_inr: number;
  month_to_date_invocations: number;
  month_to_date_success_rate: number; // 0..1
  last_24h_cost_inr: number;
  last_24h_invocations: number;
}

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

export async function GET(_request: NextRequest) {
  await connection();
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    // 1. List features
    const features = await listAllFeatures();

    // 2. Aggregate usage per feature_key in two windows: month-to-date & last 24h
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Pull both windows in one query, segregate in memory
    const { data: usageRows, error: usageErr } = await auth.supabase
      .from('ai_model_usage')
      .select('feature_key, cost_inr, success, invoked_at')
      .gte('invoked_at', monthStart.toISOString());

    if (usageErr) {
      console.error('[ai-models] usage aggregate error:', usageErr);
    }

    type UsageStats = {
      mtd_cost: number;
      mtd_count: number;
      mtd_success: number;
      h24_cost: number;
      h24_count: number;
    };
    const stats: Map<string, UsageStats> = new Map();

    for (const row of usageRows ?? []) {
      const key = row.feature_key as string;
      const cost = Number(row.cost_inr ?? 0);
      const success = row.success !== false;
      const invokedAt = new Date(row.invoked_at as string);

      const s = stats.get(key) ?? {
        mtd_cost: 0,
        mtd_count: 0,
        mtd_success: 0,
        h24_cost: 0,
        h24_count: 0,
      };

      s.mtd_cost += cost;
      s.mtd_count += 1;
      if (success) s.mtd_success += 1;

      if (invokedAt >= last24h) {
        s.h24_cost += cost;
        s.h24_count += 1;
      }

      stats.set(key, s);
    }

    // 3. Stitch together
    const enriched: FeatureWithUsage[] = features.map((f) => {
      const s = stats.get(f.feature_key);
      return {
        ...f,
        month_to_date_cost_inr: s?.mtd_cost ?? 0,
        month_to_date_invocations: s?.mtd_count ?? 0,
        month_to_date_success_rate: s && s.mtd_count > 0 ? s.mtd_success / s.mtd_count : 1,
        last_24h_cost_inr: s?.h24_cost ?? 0,
        last_24h_invocations: s?.h24_count ?? 0,
      };
    });

    return NextResponse.json({ data: enriched });
  } catch (error) {
    console.error('[ai-models] GET error:', error);
    return NextResponse.json({ error: 'Failed to load AI model config' }, { status: 500 });
  }
}
