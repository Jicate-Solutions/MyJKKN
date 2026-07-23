// =====================================================================
// Bug-Triage Loop — nightly duplicate-cluster scan
// =====================================================================
// Calls fn_bug_cluster_scan(): deterministic pg_trgm clustering over the
// open /admin/bug-reports backlog (status new/seen/in_progress, not already
// a duplicate). Proposals land in public.bug_clusters for the Groups tab;
// confirmed/dismissed decisions are never touched. Idempotent full
// recompute — safe to fire nightly (see vercel.json) or on demand.
//
// Auth + shape match app/api/cron/capgap-scan/route.ts (CRON_SECRET via
// Authorization: Bearer header OR ?secret=, service-role client).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  sendResolutionEmailAndLog,
  cascadeStatusToDuplicates,
  recordClusterOutcome
} from '@/lib/bug-reports/resolve-cascade';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }
  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const startedAt = Date.now();

  const { data, error } = await (supabase as any).rpc('fn_bug_cluster_scan');

  if (error) {
    console.error('[cron/bug-cluster-scan] fn_bug_cluster_scan failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - startedAt },
      { status: 500 }
    );
  }

  // ── AUTO-RESOLVE pass (R1-R4, built dormant) ─────────────────────────
  // fn_bug_auto_resolve_scan returns eligible groups ONLY when the feature
  // is armed: policy enabled AND the earned track record exists AND not
  // circuit-breaker-suspended. Until then it returns armed:false and this
  // block does nothing. The resolve itself reuses EXACTLY the human path
  // (email + cascade + ledger via lib/bug-reports/resolve-cascade).
  const autoResolve: { armed: boolean; resolved: string[] } = {
    armed: false,
    resolved: []
  };
  try {
    const { data: gate } = await (supabase as any).rpc('fn_bug_auto_resolve_scan');
    autoResolve.armed = gate?.armed === true;
    const eligible: any[] = Array.isArray(gate?.eligible) ? gate.eligible : [];
    for (const g of eligible) {
      // Mark FIRST (the breaker keys on this stamp), then resolve the
      // canonical exactly like the human PATCH path.
      await (supabase as any).rpc('fn_bug_auto_resolve_mark', { p_cluster_id: g.cluster_id });
      const { data: updated, error: upErr } = await (supabase as any)
        .from('bug_reports')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', g.seed_bug_id)
        .select()
        .single();
      if (upErr || !updated) continue;
      await sendResolutionEmailAndLog(supabase as any, g.seed_bug_id, updated);
      await cascadeStatusToDuplicates(supabase as any, g.seed_bug_id, 'resolved');
      await recordClusterOutcome(supabase as any, g.seed_bug_id);
      autoResolve.resolved.push(g.cluster_id);

      // R4 visibility: bell the admin who enabled the policy (real
      // notifications schema; best-effort, never fails the cron).
      if (gate?.notify_user_id) {
        try {
          const { data: notification } = await (supabase as any)
            .from('notifications')
            .insert({
              title: 'A bug group auto-resolved',
              body: `All ${g.member_count} reports in a group were resolved automatically: every reporter question settled, nobody said still-broken, at least one confirmed fixed. Reporters have been emailed.`,
              url: '/admin/bug-reports',
              category: 'bug_reports:auto_resolve',
              kind: 'work_item',
              priority: 'normal',
              targeting: { user_ids: [gate.notify_user_id] },
              metadata: { source: 'bug_auto_resolve', cluster_id: g.cluster_id },
              created_by: gate.notify_user_id
            })
            .select('id')
            .single();
          if (notification?.id) {
            await (supabase as any)
              .from('user_notifications')
              .insert([{ notification_id: notification.id, user_id: gate.notify_user_id }]);
          }
        } catch {}
      }
    }
  } catch (e: any) {
    console.error('[cron/bug-cluster-scan] auto-resolve pass failed:', String(e?.message).slice(0, 200));
  }

  return NextResponse.json({
    ok: true,
    ...(data ?? {}),
    auto_resolve: autoResolve,
    elapsed_ms: Date.now() - startedAt
  });
}
