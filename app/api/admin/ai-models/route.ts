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
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { listAllFeatures, type AiModelConfigRow } from '@/lib/services/platform/ai-model-config-service';

interface FeatureWithUsage extends AiModelConfigRow {
  month_to_date_cost_inr: number;
  month_to_date_invocations: number;
  month_to_date_success_rate: number; // 0..1
  last_24h_cost_inr: number;
  last_24h_invocations: number;
  // Config merge (2026-07-14): governance now sourced from the ai_job_types
  // registry. `lane` is the registry's max/api/either; `runnable` = this
  // feature can be enqueued + run on demand from the page (enabled, has a
  // prompt template, non-interactive → the generic drain can execute it).
  lane: string | null;
  runnable: boolean;
  // UNIFICATION (2026-07-23): false when this registry job carries no model yet
  // (provider/model_id are ''). The UI shows "Uses default model" and a "Set
  // model" button that governs the job for the first time.
  model_set: boolean;
  // VISIBILITY (2026-07-25): the registry `enabled` flag, surfaced so the
  // console can MARK dormant jobs. The service-role read below already returns
  // disabled rows (enabled=false) — they were rendering identical to enabled
  // ones because the payload only carried the conflated `runnable`. This is the
  // raw gate: a disabled job is not claimed/enqueued by the drain. Distinct from
  // `is_active` (ai_model_config's own display toggle) and from `runnable`
  // (enabled AND has-prompt AND non-interactive).
  enabled: boolean;
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

    // 1. Feature list — CONFIG MERGE (2026-07-14): the ai_job_types registry is
    // now the authoritative source of model governance, so the page's row list
    // is DRIVEN by the registry (UNIFICATION 2026-07-23: every job type, model
    // or not — model-less rows carry model_set:false), enriched
    // with ai_model_config for the display-only fields the registry does not yet
    // hold (display_name, category, config_json, is_active, audit stamps). The
    // registry also supplies `lane` and whether the feature is `runnable`.
    //
    // Read via the SERVICE-ROLE client: ai_job_types RLS is `USING (enabled =
    // true)`, so the super-admin's SESSION client only sees ENABLED rows — that
    // hides the config-carrier features (registered enabled=false because they
    // run via their own cron/route, not the generic drain) and the page would
    // show ~10 instead of all 25. This route is already super-admin gated
    // (requireSuperAdmin above), so bypassing RLS for the read is safe, and it
    // matches how getModelForFeature resolves the registry.
    const svc = createServiceRoleClient();
    // UNIFICATION (2026-07-23): return ALL registry job types, not only those
    // that carry a model. The unified console shows every one of the 45 jobs
    // grouped by lane, so model-less rows must appear too — they come back with
    // provider/model_id = null and a `model_set: false` flag. The UI renders
    // these as "Uses default model" and offers a "Set model" button that governs
    // the job for the first time (the [feature_key] PATCH upserts an
    // ai_model_config row when none exists yet).
    const { data: regRows, error: regErr } = await svc
      .from('ai_job_types')
      .select(
        'job_type, title, description, lane, enabled, prompt_template, interactive, provider, model_id, fallback_provider, fallback_model_id, monthly_spend_cap_inr, updated_at',
      );
    if (regErr) {
      console.error('[ai-models] registry list error:', regErr);
      return NextResponse.json({ error: 'Failed to load AI model config' }, { status: 500 });
    }

    // ai_model_config enrichment map (display_name / category / config_json /
    // is_active / audit stamps), keyed by feature_key === job_type.
    const mcList = await listAllFeatures();
    const mcByKey = new Map<string, AiModelConfigRow>(mcList.map((f) => [f.feature_key, f]));

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

    // 3. Stitch together. config_json is SANITIZED to derived lane flags —
    // the raw blob can hold the Max seat owner's auth.users id
    // (max_lane_user_ids), which no browser needs (deep-review finding #8).
    // Round-trip safety (deep-review re-raise, VERIFIED 2026-07-11): the only
    // writer, AiModelEditDialog, PATCHes discrete fields (provider, model_id,
    // fallback_*, monthly_spend_cap_inr, change_reason — dialog lines ~131-138)
    // and never sends config_json, so this sanitized echo cannot be written
    // back. If a future editor ever persists config_json, it must re-read the
    // raw row server-side, NOT this response shape.
    const enriched: FeatureWithUsage[] = (regRows ?? []).map((r) => {
      const mc = mcByKey.get(r.job_type as string);
      const s = stats.get(r.job_type as string);
      const cj = (mc?.config_json ?? {}) as Record<string, unknown>;
      const seatUsers = Array.isArray(cj.max_lane_user_ids) ? cj.max_lane_user_ids.length : 0;
      return {
        feature_key: r.job_type as string,
        display_name: mc?.display_name ?? (r.title as string),
        description: mc?.description ?? (r.description as string | null) ?? null,
        category:
          mc?.category ??
          (typeof r.job_type === 'string' && r.job_type.includes('.')
            ? r.job_type.split('.')[0]
            : 'other'),
        // UNIFICATION: model-less registry jobs come back with '' here; the UI
        // keys off `model_set` (below) to render "Uses default model".
        provider: (r.provider as string | null) ?? '',
        model_id: (r.model_id as string | null) ?? '',
        fallback_provider: (r.fallback_provider as string | null) ?? null,
        fallback_model_id: (r.fallback_model_id as string | null) ?? null,
        monthly_spend_cap_inr: (r.monthly_spend_cap_inr as number | null) ?? null,
        is_active: mc?.is_active ?? true,
        // config_json is SANITIZED to derived lane flags — the raw blob can hold
        // the Max seat owner's auth.users id (max_lane_user_ids), which no
        // browser needs (deep-review finding #8). The only writer,
        // AiModelEditDialog, PATCHes discrete fields and never config_json, so
        // this sanitized echo is never written back.
        config_json: {
          ...(typeof cj.lane === 'string' ? { lane: cj.lane } : {}),
          ...(seatUsers > 0 ? { seat_lane_user_count: seatUsers } : {}),
        },
        created_at: mc?.created_at ?? (r.updated_at as string) ?? '',
        updated_at: (r.updated_at as string) ?? mc?.updated_at ?? '',
        updated_by: mc?.updated_by ?? null,
        change_reason: mc?.change_reason ?? null,
        // Config-merge additions (registry-sourced):
        lane: (r.lane as string | null) ?? null,
        runnable:
          r.enabled === true && !!r.prompt_template && r.interactive === false,
        model_set: r.model_id != null,
        // VISIBILITY (2026-07-25): surface the raw registry gate so the console
        // can badge disabled jobs. Already fetched in the .select() above.
        enabled: r.enabled === true,
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
