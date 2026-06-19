export const dynamic = 'force-dynamic';

/**
 * GET /api/social/governance
 *
 * READ-ONLY "consequences" feed for the Director's-View governance surface
 * (`/admission/social/governance`). It does NOT change any policy — it reads
 * each live social policy value and computes, against the canonical metrics
 * tables, the PLAIN-ENGLISH CONSEQUENCE of that value right now:
 *
 *   1. Dormancy threshold       → N handles flagged dormant
 *   2. Compliance floor         → M handles fail (followers / posts)
 *   3. Follow-back ratio flag    → K handles exceed the ratio
 *   4. Real-time publishing     → ON / OFF
 *   5. Lifecycle cascade        → counts of social_dept_accounts by lifecycle
 *
 * Policy values are read via the canonical `fn_get_policy*` substrate
 * (`@/lib/policies/get-policy`). The keys are seeded as `social.*` by a
 * sibling agent; until then the documented code defaults below fire (the
 * page shows those defaults and the consequences are still computed live).
 *
 * Metrics are read from the canonical tables:
 *   - ig_accounts          (status, last_post_at) — the access_token column is
 *                          NEVER selected here (security boundary).
 *   - ig_account_metrics   (followers / follows / media_count) — reduced to the
 *                          LATEST snapshot per account (order by snapshot_at
 *                          desc, first-wins reduce).
 *   - social_dept_accounts (lifecycle_status) — column is added by a sibling
 *                          agent; this route fail-soft detects its absence.
 *
 * Auth: any authenticated user holding social.view OR social.governance.view
 * (defense-in-depth — mirrors the page's PermissionGuard). The PostgREST
 * reads still run under the caller's RLS, so a user without social access
 * gets zero rows even past this check.
 */

import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPolicy } from '@/lib/policies/get-policy';

// ── Documented code defaults (fire until the sibling agent seeds social.*) ──
const DEFAULTS = {
  dormancyThresholdDays: 30,
  minFollowers: 100,
  minPosts: 10,
  followbackRatioThreshold: 1.0,
  realtimeEnabled: false,
} as const;

interface IgAccountRow {
  id: string;
  status: string | null;
  last_post_at: string | null;
  metrics_source: string | null;
}

interface IgMetricRow {
  account_id: string;
  snapshot_at: string;
  followers: number | null;
  follows: number | null;
  media_count: number | null;
}

interface DeptLifecycleRow {
  lifecycle_status: string | null;
}

export async function GET() {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Permission gate (defense-in-depth; RLS is the real boundary).
    // user_has_permission merges all of the caller's roles with OR logic and
    // short-circuits true for super-admins.
    const [{ data: canView }, { data: canGov }] = await Promise.all([
      supabase.rpc('user_has_permission', { permission_name: 'social.view' }),
      supabase.rpc('user_has_permission', {
        permission_name: 'social.governance.view',
      }),
    ]);
    if (canView !== true && canGov !== true) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You do not have access to Social Governance. Ask an administrator to grant the Social Media permissions to your role.',
        },
        { status: 403 }
      );
    }

    // ── Read live policy values (fail-soft to documented defaults) ──────────
    const [
      dormancyRaw,
      minFollowersRaw,
      minPostsRaw,
      realtimeRaw,
      followbackRaw,
    ] = await Promise.all([
      getPolicy<number>('social.dormancy_threshold_days'),
      getPolicy<number>('social.compliance.min_followers'),
      getPolicy<number>('social.compliance.min_posts'),
      getPolicy<boolean>('social.realtime_enabled'),
      getPolicy<number>('social.followback_ratio_threshold'),
    ]);

    // Each value: use the live policy when seeded, else the documented default.
    // A single read per key tells us both the value AND whether it's seeded
    // (null = no platform_policies row yet → falling back to a code default).
    const dormancyThresholdDays =
      typeof dormancyRaw === 'number' ? dormancyRaw : DEFAULTS.dormancyThresholdDays;
    const minFollowers =
      typeof minFollowersRaw === 'number' ? minFollowersRaw : DEFAULTS.minFollowers;
    const minPosts =
      typeof minPostsRaw === 'number' ? minPostsRaw : DEFAULTS.minPosts;
    const realtimeEnabled =
      typeof realtimeRaw === 'boolean' ? realtimeRaw : DEFAULTS.realtimeEnabled;
    const followbackRatioThreshold =
      typeof followbackRaw === 'number' ? followbackRaw : DEFAULTS.followbackRatioThreshold;

    // Which keys are actually seeded vs falling back to code default — surfaced
    // in the UI so the Director can tell "live policy" from "not configured yet".
    const seeded = {
      dormancy: dormancyRaw !== null,
      minFollowers: minFollowersRaw !== null,
      minPosts: minPostsRaw !== null,
      realtime: realtimeRaw !== null,
      followback: followbackRaw !== null,
    };

    // Untyped client: ig_accounts / ig_account_metrics / social_dept_accounts
    // are not in the generated Database types; the typed client blows TS's
    // instantiation depth (TS2589) on these selects. Cast to explicit row
    // interfaces above. (Same pattern as social/departments/page.tsx.)
    const db = supabase as unknown as SupabaseClient;

    // ── ig_accounts: status + last activity (NEVER select access_token) ─────
    const { data: accountsRaw, error: accErr } = await db
      .from('ig_accounts')
      .select('id, status, last_post_at, metrics_source');
    if (accErr) {
      return NextResponse.json(
        { success: false, error: `Failed to read ig_accounts: ${accErr.message}` },
        { status: 500 }
      );
    }
    const accounts = (accountsRaw as IgAccountRow[]) ?? [];
    const totalAccounts = accounts.length;

    // ── Latest metric snapshot per account ─────────────────────────────────
    // 11k+ rows: pull (account_id, snapshot_at, the three metrics) ordered
    // newest-first, then first-wins reduce into a per-account map. We only
    // need columns relevant to the consequences — no raw JSON blob.
    const { data: metricsRaw, error: metErr } = await db
      .from('ig_account_metrics')
      .select('account_id, snapshot_at, followers, follows, media_count')
      .order('snapshot_at', { ascending: false });
    if (metErr) {
      return NextResponse.json(
        { success: false, error: `Failed to read ig_account_metrics: ${metErr.message}` },
        { status: 500 }
      );
    }
    const latestByAccount = new Map<string, IgMetricRow>();
    for (const m of (metricsRaw as IgMetricRow[]) ?? []) {
      // ordered desc → the first row seen for an account is its latest.
      if (!latestByAccount.has(m.account_id)) latestByAccount.set(m.account_id, m);
    }

    // ── Consequence 1: dormancy ────────────────────────────────────────────
    // A handle is "dormant" when its last activity is older than the threshold.
    // last_post_at is the canonical last-activity signal but is sparsely
    // populated (only graph-source accounts return it), so we also count the
    // accounts the poller has already marked status='dormant' — whichever is
    // the broader signal. We report the count of accounts past the threshold
    // by last_post_at AND, separately, the poller's own dormant flag, taking
    // the union so the Director sees the real exposure.
    const now = Date.now();
    const thresholdMs = dormancyThresholdDays * 86_400_000;
    const dormantIds = new Set<string>();
    for (const a of accounts) {
      const byStatus = a.status === 'dormant';
      const byActivity =
        a.last_post_at != null &&
        now - new Date(a.last_post_at).getTime() > thresholdMs;
      if (byStatus || byActivity) dormantIds.add(a.id);
    }
    const dormantCount = dormantIds.size;
    // How many we simply can't evaluate by activity date (no last_post_at and
    // not flagged) — surfaced as a data-coverage caveat, not counted as pass.
    const noActivityData = accounts.filter(
      (a) => a.last_post_at == null && a.status !== 'dormant'
    ).length;

    // ── Consequence 2: compliance floor (followers + posts) ────────────────
    // A handle FAILS compliance if its latest followers < floor OR latest
    // media_count < floor. Accounts with no snapshot yet are treated as
    // "no data" (cannot confirm pass), reported separately.
    let complianceFail = 0;
    let complianceNoData = 0;
    for (const a of accounts) {
      const m = latestByAccount.get(a.id);
      if (!m) {
        complianceNoData++;
        continue;
      }
      const followers = m.followers ?? 0;
      const posts = m.media_count ?? 0;
      if (followers < minFollowers || posts < minPosts) complianceFail++;
    }

    // ── Consequence 3: follow-back ratio ───────────────────────────────────
    // follows / followers > threshold (a handle following far more than it is
    // followed by — a spam/auto-follow signal). `follows` is only populated
    // for graph-source accounts (business_discovery returns 0), so the ratio
    // is only meaningful where follows > 0; we count exceedances among those
    // and report how many accounts have usable follows data.
    let followbackExceed = 0;
    let followbackEvaluable = 0;
    for (const a of accounts) {
      const m = latestByAccount.get(a.id);
      if (!m) continue;
      const followers = m.followers ?? 0;
      const follows = m.follows ?? 0;
      if (follows > 0 && followers > 0) {
        followbackEvaluable++;
        if (follows / followers > followbackRatioThreshold) followbackExceed++;
      }
    }

    // ── Consequence 5: lifecycle cascade ───────────────────────────────────
    // social_dept_accounts.lifecycle_status is added by a sibling agent. If the
    // column does not exist yet, PostgREST returns 42703 — we detect that and
    // return a `lifecycleAvailable: false` flag instead of 500ing, so the page
    // renders cleanly today and lights up the moment the sibling PR merges.
    const LIFECYCLE_ORDER = ['official', 'provisional', 'deprecated', 'kill'];
    let lifecycleAvailable = true;
    const lifecycleCounts: Record<string, number> = {};
    let deptTotal = 0;
    {
      const { data: lcRaw, error: lcErr } = await db
        .from('social_dept_accounts')
        .select('lifecycle_status');
      if (lcErr) {
        // 42703 = undefined_column. Any other error is a genuine failure.
        if (lcErr.code === '42703' || /lifecycle_status/.test(lcErr.message)) {
          lifecycleAvailable = false;
        } else {
          return NextResponse.json(
            {
              success: false,
              error: `Failed to read social_dept_accounts: ${lcErr.message}`,
            },
            { status: 500 }
          );
        }
      } else {
        const rows = (lcRaw as DeptLifecycleRow[]) ?? [];
        deptTotal = rows.length;
        for (const r of rows) {
          const k = r.lifecycle_status ?? 'unset';
          lifecycleCounts[k] = (lifecycleCounts[k] ?? 0) + 1;
        }
      }
    }
    const lifecycle = (lifecycleAvailable
      ? [
          ...LIFECYCLE_ORDER.filter((k) => k in lifecycleCounts),
          ...Object.keys(lifecycleCounts).filter(
            (k) => !LIFECYCLE_ORDER.includes(k)
          ),
        ].map((status) => ({ status, count: lifecycleCounts[status] }))
      : []) as { status: string; count: number }[];

    return NextResponse.json({
      success: true,
      data: {
        policies: {
          dormancyThresholdDays,
          minFollowers,
          minPosts,
          followbackRatioThreshold,
          realtimeEnabled,
          seeded,
        },
        consequences: {
          dormancy: {
            threshold_days: dormancyThresholdDays,
            flagged: dormantCount,
            total: totalAccounts,
            no_activity_data: noActivityData,
          },
          compliance: {
            min_followers: minFollowers,
            min_posts: minPosts,
            failed: complianceFail,
            total: totalAccounts,
            no_data: complianceNoData,
          },
          followback: {
            ratio_threshold: followbackRatioThreshold,
            exceeded: followbackExceed,
            evaluable: followbackEvaluable,
            total: totalAccounts,
          },
          realtime: {
            enabled: realtimeEnabled,
          },
          lifecycle: {
            available: lifecycleAvailable,
            total: deptTotal,
            breakdown: lifecycle,
          },
        },
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : 'Unexpected error computing governance consequences',
      },
      { status: 500 }
    );
  }
}
