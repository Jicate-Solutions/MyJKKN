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
import { readCount } from '@/lib/bug-reports/read-count';

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


  // ── AUTO-REQUEST FIXABILITY (Director decision 2026-10-10) ──────────────
  // Until now a fixability verdict existed only if an admin clicked "Check
  // fixability" on the Groups tab. Nobody has clicked since August, so every
  // proposal has sat unassessed. This pass requests one automatically.
  //
  // THREE GUARDS, each load-bearing:
  //
  // 1. NEVER RE-REQUEST. fn_bug_cluster_fixability_request short-circuits only
  //    on status 'requested'/'running'. Called on a cluster already 'done' it
  //    OVERWRITES the stored verdict with a fresh 'requested' stamp, destroying
  //    a finished assessment. So we request only for clusters whose metadata has
  //    NO 'fixability' key at all. 'error' is left alone too: a nightly retry on
  //    a reproducibly-failing cluster would burn the single fixability slot every
  //    night for nothing. Retrying those is a human decision.
  //
  // 2. MyJKKN CODE ONLY. The Mac fixability runner builds a git worktree of the
  //    MyJKKN checkout and reads MyJKKN source. A report carrying application_id
  //    (another college app filing into this table from 2026-10 onward) would be
  //    analysed against the wrong codebase — confidently and wrongly. Clusters
  //    carry no application_id of their own, so we check their MEMBERS and skip
  //    any cluster holding even one foreign-app report. Fails CLOSED: a cluster
  //    we cannot prove is MyJKKN-only is skipped, not analysed.
  //
  // 3. PACED. bug.fixability has max_inflight 1 and a real run takes ~4 minutes,
  //    so the queue already drains serially. The cap bounds how long that single
  //    slot stays occupied in one night (Director: "a few at a time, so the
  //    machines aren't flooded"). platform_policies row, code default 10.
  const fixability: {
    eligible: number;
    requested: string[];
    skipped_foreign_app: number;
    cap: number;
    error?: string;
  } = { eligible: 0, requested: [], skipped_foreign_app: 0, cap: 0 };
  try {
    // ?fixability=N caps this run only — so the pass can be exercised by hand
    // without occupying the single fixability slot for the full nightly batch.
    // Precedence: query override → policy row → code default. See readCount for
    // why absence must never be read as an explicit 0.
    fixability.cap =
      readCount(req.nextUrl.searchParams.get('fixability')) ??
      (await readFixabilityCap(supabase));

    const { data: proposals, error: propErr } = await (supabase as any)
      .from('bug_clusters')
      .select('id, member_ids, metadata, first_seen_at')
      .eq('status', 'proposed')
      .order('first_seen_at', { ascending: true });
    if (propErr) throw new Error(propErr.message);

    // Guard 1 in code rather than a jsonb-path filter: the proposal set is a few
    // dozen rows, and "has no fixability key" is unambiguous here.
    const never = (Array.isArray(proposals) ? proposals : []).filter(
      (c: any) => !c?.metadata?.fixability
    );
    fixability.eligible = never.length;

    for (const c of never) {
      if (fixability.requested.length >= fixability.cap) break;

      const members: string[] = Array.isArray(c.member_ids) ? c.member_ids : [];
      if (members.length === 0) continue; // nothing to analyse

      const { data: foreign, error: foreignErr } = await (supabase as any)
        .from('bug_reports')
        .select('id')
        .in('id', members)
        .not('application_id', 'is', null)
        .limit(1);

      if (foreignErr || (Array.isArray(foreign) && foreign.length > 0)) {
        fixability.skipped_foreign_app += 1;
        continue;
      }

      const { data: req, error: reqErr } = await (supabase as any).rpc(
        'fn_bug_cluster_fixability_request',
        { p_cluster_id: c.id }
      );
      if (reqErr || req?.success !== true) {
        console.error(
          '[cron/bug-cluster-scan] fixability request failed:',
          c.id,
          reqErr?.message ?? req?.error
        );
        continue;
      }
      if (req?.note !== 'already_queued') fixability.requested.push(c.id);
    }
  } catch (e: any) {
    fixability.error = String(e?.message ?? e).slice(0, 200);
    console.error('[cron/bug-cluster-scan] fixability pass failed:', fixability.error);
  }

  return NextResponse.json({
    ok: true,
    ...(data ?? {}),
    auto_resolve: autoResolve,
    fixability,
    elapsed_ms: Date.now() - startedAt
  });
}

/**
 * How many never-assessed proposals may be queued for a fixability check in one
 * run. platform_policies row `bug_reports.ai_auto.fixability_per_run`; the code
 * default applies when the row is missing, inactive or not a positive number, so
 * this ships working before the migration is applied. 0 switches the pass off.
 */
const FIXABILITY_PER_RUN_KEY = 'bug_reports.ai_auto.fixability_per_run';
const FIXABILITY_PER_RUN_DEFAULT = 10;

async function readFixabilityCap(
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<number> {
  try {
    const { data, error } = await (supabase as any).rpc('fn_get_policy', {
      p_key: FIXABILITY_PER_RUN_KEY,
      p_scope_id: null
    });
    if (error) return FIXABILITY_PER_RUN_DEFAULT;
    return readCount(data) ?? FIXABILITY_PER_RUN_DEFAULT;
  } catch {
    return FIXABILITY_PER_RUN_DEFAULT;
  }
}
