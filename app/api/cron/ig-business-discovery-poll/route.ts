export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/ig-business-discovery-poll
 *
 * Public-metrics poller for department Instagram accounts that have NO linked
 * Facebook Page. Meta's Facebook-Login Graph API cannot read private insights
 * (reach/impressions/demographics) for a non-Page-linked account — but the
 * `business_discovery` edge returns PUBLIC metrics (followers, media_count,
 * per-post likes + comments) for ANY public Business/Creator account, queried
 * FROM one of our own (page-linked) accounts. No Page, no per-account token —
 * the existing system token + one origin college account is enough.
 *
 * Per tick, for every social_dept_accounts handle:
 *   1. business_discovery → followers, media_count, recent media + engagement
 *   2. upsert ig_accounts (metrics_source='business_discovery') — keeps these
 *      OFF the full-insights poller (which would 33-error on them)
 *   3. append ig_account_metrics (followers, media_count)
 *   4. upsert ig_posts + append ig_post_metrics (likes, comments, engagement)
 *   5. link social_dept_accounts.ig_account_id → /admission/social/departments
 *      "Monitored" chip flips on
 *
 * reach/impressions/saves/demographics stay NULL (not available without a
 * Page) — the dashboard already renders nulls as "—".
 *
 * Auth: Bearer CRON_SECRET (Vercel-provided in production).
 */

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  classifyBdError,
  selectSuppressedHandles,
  SUPPRESSION_WINDOW_DAYS,
  type BdErrorKind,
  type BdErrorLogRow,
  type SuppressedHandle,
} from '@/lib/instagram/business-discovery-errors';

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const RECENT_MEDIA_LIMIT = 25;

/**
 * Media page size for the ONE retry made when Meta refuses on response size.
 * Only the handle that was actually too big pays this; the rest keep the full
 * 25-post window. "Please reduce the amount of data…" has occurred exactly once
 * on this event in 89 days (2026-08-10) and four times across the whole logs
 * table, so shrinking the request for everybody would trade real caption and
 * media fidelity on 11 healthy handles for a fault that fires once a quarter.
 */
const OVERSIZED_RETRY_MEDIA_LIMIT = 5;

/** Cap on the suppression lookup. In steady state it reads ~7 rows; the cap is
 *  a guard, and truncation can only UNDER-count, i.e. suppress less. */
const SUPPRESSION_ROW_CAP = 5000;

// media_type from business_discovery is IMAGE | VIDEO | CAROUSEL_ALBUM.
// ig_posts.media_type CHECK also allows REEL/STORY; map unknowns to IMAGE.
const VALID_MEDIA_TYPES = new Set(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'REEL', 'STORY']);

interface BdMedia {
  id: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  timestamp?: string;
  caption?: string;
  permalink?: string;
}

interface BusinessDiscovery {
  id: string;
  username?: string;
  name?: string;
  followers_count?: number;
  media_count?: number;
  media?: { data?: BdMedia[] };
}

interface DeptRow {
  id: string;
  username: string;
  institution_id: string | null;
  department_id: string | null;
}

function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** Resolve an owned, page-linked Business account id to query business_discovery FROM. */
async function resolveOriginId(token: string): Promise<string | null> {
  const businessId = process.env.META_BUSINESS_MANAGER_ID;
  if (businessId) {
    try {
      const res = await fetch(
        `${GRAPH_API}/${businessId}/owned_instagram_accounts?fields=id,username&limit=50&access_token=${encodeURIComponent(token)}`,
        { cache: 'no-store' }
      );
      const json = (await res.json()) as { data?: { id: string; username: string }[] };
      const accounts = json.data ?? [];
      // Prefer the flagship handle; else any owned account.
      const flagship = accounts.find((a) => a.username === 'jkkninstitutions');
      if (flagship) return flagship.id;
      if (accounts[0]) return accounts[0].id;
    } catch {
      /* fall through */
    }
  }
  // Fallback: first Page's linked IG account.
  try {
    const res = await fetch(
      `${GRAPH_API}/me/accounts?fields=instagram_business_account{id}&limit=25&access_token=${encodeURIComponent(token)}`,
      { cache: 'no-store' }
    );
    const json = (await res.json()) as {
      data?: { instagram_business_account?: { id: string } }[];
    };
    for (const p of json.data ?? []) {
      if (p.instagram_business_account?.id) return p.instagram_business_account.id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * One account per call — `business_discovery.username(<one handle>)` — so there
 * is no batch to shrink here. `mediaLimit` is the only size dial, and it is
 * turned down ONLY on the oversized retry path.
 *
 * `caption` stays in the field list on BOTH paths on purpose. ig_posts is
 * upserted on ig_media_id below (a conflict is an UPDATE), and the payload
 * writes `caption: m.caption ?? null` — so a request that omitted caption would
 * overwrite every stored caption with NULL for the handle it was meant to
 * rescue. Fewer media rows, same fields.
 */
async function fetchBusinessDiscovery(
  originId: string,
  username: string,
  token: string,
  mediaLimit: number = RECENT_MEDIA_LIMIT
): Promise<{ bd: BusinessDiscovery | null; error: string | null; kind: BdErrorKind | null }> {
  const fields =
    `business_discovery.username(${username})` +
    `{id,username,name,followers_count,media_count,` +
    `media.limit(${mediaLimit}){id,like_count,comments_count,media_type,timestamp,caption,permalink}}`;
  const url = `${GRAPH_API}/${originId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json()) as {
    business_discovery?: BusinessDiscovery;
    error?: { message?: string };
  };
  if (json.error || !json.business_discovery) {
    const message =
      json.error?.message ?? `no business_discovery in response (HTTP ${res.status})`;
    return { bd: null, error: message, kind: classifyBdError(message) };
  }
  return { bd: json.business_discovery, error: null, kind: null };
}

/**
 * Handles that must not be called this tick, read from the failures the route
 * already writes. State lives entirely in social_instagram_logs — no new
 * column, no migration, no schema change.
 *
 * Never let this read change the outcome of the tick: on any failure the map
 * comes back empty and every handle is polled exactly as before.
 */
async function loadSuppressedHandles(
  supabase: SupabaseClient,
  nowMs: number
): Promise<Map<string, SuppressedHandle>> {
  try {
    const since = new Date(nowMs - SUPPRESSION_WINDOW_DAYS * 86_400_000).toISOString();
    // Index-backed: idx_social_instagram_logs_event_time is
    // (event_type, occurred_at DESC), so this is a range scan even though the
    // table holds 182,837 rows.
    const { data, error } = await supabase
      .from('social_instagram_logs')
      .select('payload, error_message, occurred_at')
      .eq('event_type', 'business_discovery_fetch')
      .eq('status', 'error')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(SUPPRESSION_ROW_CAP);
    if (error || !data) return new Map();
    return selectSuppressedHandles(data as unknown as BdErrorLogRow[], nowMs);
  } catch {
    return new Map();
  }
}

/**
 * One social_instagram_logs row per failed handle. Hygiene fix 2026-06-12:
 * @jkkn_otat failed fetchBusinessDiscovery EVERY tick with a bare
 * `failed++; continue;` — no log row, no per-handle trace in the response
 * (prod recon 2026-06-11: 54 active bd handles, only 53 rows per tick).
 * Logging must never kill the tick — its own failures are swallowed.
 */
async function logHandleFailure(
  supabase: SupabaseClient,
  username: string,
  message: string,
  kind: BdErrorKind = 'transient'
): Promise<void> {
  try {
    await supabase.from('social_instagram_logs').insert({
      account_id: null,
      event_type: 'business_discovery_fetch',
      status: 'error',
      // `kind` is for whoever reads the row. Suppression re-derives the kind
      // from error_message so it also understands the 6,653 rows written
      // before this field existed.
      payload: { username, kind },
      error_message: message.slice(0, 500),
      occurred_at: new Date().toISOString(),
    });
  } catch {
    /* never throw from logging */
  }
}

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const token =
    process.env.META_IG_SYSTEM_USER_TOKEN ||
    process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    '';
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'no Meta token configured' },
      { status: 503 }
    );
  }

  const supabase = svc();

  const originId = await resolveOriginId(token);
  if (!originId) {
    return NextResponse.json(
      { success: false, error: 'could not resolve a business_discovery origin account' },
      { status: 502 }
    );
  }

  // Department handles to poll: the social_dept_accounts registry (PR #1292).
  const { data: deptRows, error: deptErr } = await supabase
    .from('social_dept_accounts')
    .select('id, username, institution_id, department_id')
    .eq('platform', 'instagram');
  if (deptErr) {
    return NextResponse.json({ success: false, error: deptErr.message }, { status: 500 });
  }

  // Skip accounts that this poll must NOT downgrade to business_discovery:
  //   - 'instagram_login': upgraded to per-account Instagram Login, get FULL
  //     insights from ig-login-insights-poll. Skipping here avoids flipping
  //     their metrics_source back and keeps their series free of public-only
  //     snapshot rows.
  //   - 'graph': graph-readable accounts managed by the /accounts/sync route
  //     (their Page is in /me/accounts). The business_discovery upsert below
  //     would otherwise revert a graph dept account every hour — the exact
  //     revert this skip prevents.
  // Two skip axes: username (matches the registry handle pre-fetch) AND
  // ig_user_id (matches the upsert conflict key, in case the stored handle
  // drifted from the sheet handle).
  const { data: upgradedRows } = await supabase
    .from('ig_accounts')
    .select('username, ig_user_id')
    .in('metrics_source', ['instagram_login', 'graph']);
  const upgraded = new Set(
    (upgradedRows ?? []).map((r) => (r.username as string).toLowerCase())
  );
  const upgradedIds = new Set(
    (upgradedRows ?? []).map((r) => r.ig_user_id as string).filter(Boolean)
  );

  let resolved = 0;
  let seeded = 0;
  let metricsWritten = 0;
  let postsWritten = 0;
  let failed = 0;
  const failedHandles: string[] = [];
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  let skippedUpgraded = 0;

  // Handles Meta has permanently rejected. Without this the poller retried a
  // dead handle 24x a day forever: @jkkn_otat has 2,101 consecutive failures
  // since 12 June and has never once succeeded, while its ig_accounts row still
  // reads status='active' and its follower numbers are frozen at 10 June.
  const suppressedHandles = await loadSuppressedHandles(supabase, nowMs);
  const suppressedThisTick: SuppressedHandle[] = [];

  for (const dept of (deptRows ?? []) as DeptRow[]) {
    if (upgraded.has(dept.username.toLowerCase())) {
      skippedUpgraded++;
      continue;
    }
    const suppression = suppressedHandles.get(dept.username.toLowerCase());
    if (suppression) {
      // Still retried once per UTC day, so the handle recovers on its own the
      // moment the department restores it — the three handles that went dark
      // before this existed only stopped erroring because a human deleted or
      // re-linked their registry row.
      suppressedThisTick.push(suppression);
      continue;
    }
    try {
      let { bd, error: bdError, kind: bdKind } = await fetchBusinessDiscovery(
        originId,
        dept.username,
        token
      );
      // Meta refused on response size. Ask this ONE handle for fewer media rows
      // (same fields — see fetchBusinessDiscovery on why caption must stay).
      if (!bd && bdKind === 'oversized') {
        ({ bd, error: bdError, kind: bdKind } = await fetchBusinessDiscovery(
          originId,
          dept.username,
          token,
          OVERSIZED_RETRY_MEDIA_LIMIT
        ));
      }
      if (!bd || !bd.id) {
        failed++;
        failedHandles.push(dept.username);
        await logHandleFailure(
          supabase,
          dept.username,
          bdError ?? 'empty business_discovery response',
          bdKind ?? 'transient'
        );
        continue;
      }
      // Second skip axis: the discovery id IS the upsert conflict key — this
      // guarantees an instagram_login row can never be flipped back even if
      // the handles diverged.
      if (upgradedIds.has(bd.id)) {
        skippedUpgraded++;
        continue;
      }
      resolved++;

      if (!dept.institution_id) {
        // ig_accounts.institution_id is NOT NULL — skip unmapped handles.
        continue;
      }

      // 1. upsert ig_accounts (department, business_discovery source)
      const { data: acct, error: acctErr } = await supabase
        .from('ig_accounts')
        .upsert(
          {
            institution_id: dept.institution_id,
            department_id: dept.department_id,
            ig_user_id: bd.id,
            username: bd.username || dept.username,
            account_type: 'BUSINESS',
            status: 'active',
            metrics_source: 'business_discovery',
            last_polled_at: now,
            last_discovery_at: now,
            updated_at: now,
          },
          { onConflict: 'ig_user_id', ignoreDuplicates: false }
        )
        .select('id')
        .maybeSingle();
      if (acctErr || !acct?.id) {
        failed++;
        failedHandles.push(dept.username);
        await logHandleFailure(
          supabase,
          dept.username,
          `ig_accounts upsert failed: ${acctErr?.message ?? 'no id returned'}`
        );
        continue;
      }
      seeded++;
      const accountId = acct.id as string;

      // 2. account-level metrics snapshot (public only; insights stay NULL)
      const { error: amErr } = await supabase.from('ig_account_metrics').insert({
        account_id: accountId,
        snapshot_at: now,
        followers: bd.followers_count ?? 0,
        follows: 0,
        media_count: bd.media_count ?? 0,
        raw: { source: 'business_discovery', name: bd.name ?? null },
      });
      if (!amErr) metricsWritten++;

      // 3. link the registry row → "Monitored" chip
      await supabase
        .from('social_dept_accounts')
        .update({ ig_account_id: accountId, updated_at: now })
        .eq('id', dept.id);

      // 4. recent posts + per-post engagement
      for (const m of bd.media?.data ?? []) {
        if (!m.id || !m.timestamp) continue;
        const mediaType =
          m.media_type && VALID_MEDIA_TYPES.has(m.media_type) ? m.media_type : 'IMAGE';
        const { data: post, error: postErr } = await supabase
          .from('ig_posts')
          .upsert(
            {
              account_id: accountId,
              ig_media_id: m.id,
              posted_at: m.timestamp,
              media_type: mediaType,
              caption: m.caption ?? null,
              permalink: m.permalink ?? null,
            },
            { onConflict: 'ig_media_id', ignoreDuplicates: false }
          )
          .select('id')
          .maybeSingle();
        if (postErr || !post?.id) continue;

        const likes = m.like_count ?? 0;
        const comments = m.comments_count ?? 0;
        const { error: pmErr } = await supabase.from('ig_post_metrics').insert({
          post_id: post.id,
          snapshot_at: now,
          reach: 0,
          impressions: 0,
          engagement: likes + comments,
          saves: 0,
          shares: 0,
          comments,
          likes,
          raw: { source: 'business_discovery' },
        });
        if (!pmErr) postsWritten++;
      }
    } catch (e) {
      failed++;
      failedHandles.push(dept.username);
      await logHandleFailure(
        supabase,
        dept.username,
        e instanceof Error ? e.message : 'unknown'
      );
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      origin_id: originId,
      handles: deptRows?.length ?? 0,
      skipped_instagram_login: skippedUpgraded,
      resolved,
      seeded,
      account_metrics: metricsWritten,
      post_metrics: postsWritten,
      failed,
      failed_handles: failedHandles,
      // Handles Meta permanently rejects, skipped this tick and retried once a
      // day. Surfaced here because until now the failure existed only as a log
      // row written 24x a day, attached to no account (logHandleFailure writes
      // account_id: null) and read by nobody.
      suppressed: suppressedThisTick.length,
      suppressed_handles: suppressedThisTick,
      duration_ms: Date.now() - start,
    },
  });
}
