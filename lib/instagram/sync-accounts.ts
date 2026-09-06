/**
 * lib/instagram/sync-accounts.ts
 *
 * Shared core for syncing discovered Instagram Professional accounts into the
 * ig_accounts table. Extracted from the POST /api/social/instagram/accounts/sync
 * route so BOTH that route AND the daily auto-detection cron
 * (GET /api/cron/ig-accounts-sync) run the SAME discovery + classification
 * logic — the cron is what makes newly-Page-connected department accounts flip
 * business_discovery → graph without a human pressing "Discover".
 *
 * Discovery uses the proven `GET /me/accounts` page-edge pattern from
 * app/api/cron/meta-facebook-poll/route.ts (no business-manager id needed),
 * paginated + retried so a truncated/transient Meta response degrades to
 * skip-not-misroute. Per-account profile hydration uses lib/instagram/api-client.ts.
 * institution_id is resolved from the parent Page via fb_pages
 * (fb_page_id → institution_id), then the social_dept_accounts registry, then
 * the caller-provided fallback.
 *
 * metrics_source routing is OWNERSHIP-based and is the root-cause fix for
 * department accounts being mis-stored:
 *   - Page-owned (resolved a `parent` from /me/accounts) → 'graph'
 *   - Extra-portfolio (owned_instagram_accounts, no Page) → 'business_discovery'
 *   - Unknown (enumeration failed AND no parent/extra) → SKIPPED, not guessed
 *     (an INSERT would take the 'graph' NOT-NULL default and orphan a dept
 *     account; an UPDATE would downgrade an existing 'graph' row).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { discoverAccounts, getAccountProfile } from '@/lib/instagram/api-client';
import { getExtraIgPortfolios } from '@/lib/instagram/extra-portfolios';

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const GRAPH_VERSION = 'v25.0';

// ig_accounts.account_type has CHECK (account_type IN ('BUSINESS','CREATOR','PERSONAL'))
const VALID_ACCOUNT_TYPES = new Set(['BUSINESS', 'CREATOR', 'PERSONAL']);

interface MeAccountsPage {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
}

interface MeAccountsResponse {
  data?: MeAccountsPage[];
  paging?: { next?: string };
  error?: { message?: string; code?: number; type?: string };
}

interface ParentPageInfo {
  pageId: string;
  pageToken: string | null;
  igUsername: string | null;
}

export interface IgSyncAccountResult {
  ig_user_id: string;
  username: string;
  status: 'upserted' | 'error';
  error?: string;
}

export interface IgSyncData {
  synced: number;
  failed: number;
  total: number;
  results: IgSyncAccountResult[];
}

/**
 * Structured outcome the HTTP callers map to status codes:
 *   - ok:true             → 200, data
 *   - no_token            → 503 (no Meta token configured)
 *   - enumeration_failed  → 502 (/me/accounts failed AND nothing else to sync)
 */
export type IgSyncOutcome =
  | { ok: true; data: IgSyncData }
  | { ok: false; code: 'no_token'; error: string }
  | { ok: false; code: 'enumeration_failed'; error: string };

export interface IgSyncOptions {
  /** Fallback institution for accounts with no fb_pages/registry mapping. */
  institutionId?: string | null;
  /** Restrict the sync to these IG user IDs; omit to discover + sync all. */
  igUserIds?: string[];
}

// social_instagram_logs columns: account_id, event_type, payload, status,
// error_message, occurred_at (see migration 20260530140000). Fail-silent —
// a log failure must never break the sync.
async function writeLog(
  supabase: SupabaseClient,
  params: {
    event_type: string;
    status: 'success' | 'error';
    payload: Record<string, unknown>;
    error_message: string | null;
  }
) {
  try {
    await supabase.from('social_instagram_logs').insert({
      account_id: null,
      event_type: params.event_type,
      status: params.status,
      payload: params.payload,
      error_message: params.error_message,
    });
  } catch (err: unknown) {
    console.warn('[ig-sync] Log write failed:', err);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Alert super admins when /me/accounts enumeration fails persistently (after
// retries). A degraded enumeration means accounts whose ownership can't be
// determined are skipped this run, so a human should know to check Meta
// connectivity. Fail-silent — an alert failure must never break the sync.
//
// Delivery requires TWO writes (there is no DB trigger that fans out): a shared
// `notifications` row, then per-recipient `user_notifications` rows — that
// fan-out is what surfaces the alert in each admin's bell / inbox / push (the
// pattern every notify path in the repo follows, e.g. work-pulse/notify).
// kind:'announcement' additionally surfaces it on the /admin/notifications page.
// Deduped per-day via a pre-check on idempotency_key so a repeatedly-failing
// run alerts at most once a day.
async function alertEnumerationFailure(
  supabase: SupabaseClient,
  errorMessage: string
) {
  try {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true);
    const adminIds = (admins ?? [])
      .map((a) => a.id as string)
      .filter(Boolean);
    if (adminIds.length === 0) return;

    const idempKey = `ig-sync-enum-fail-${new Date().toISOString().slice(0, 10)}`;
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('idempotency_key', idempKey)
      .maybeSingle();
    if (existing) return; // already alerted today

    const { data: notif } = await supabase
      .from('notifications')
      .insert({
        title: 'Instagram sync: Meta enumeration failing',
        body: `The Instagram account sync could not list Facebook Pages from Meta after retries (${errorMessage}). Accounts that could not be classified were skipped this run and will be retried on the next sync. Check Meta API connectivity / token validity if this persists.`,
        created_by: adminIds[0],
        targeting: { user_ids: adminIds },
        category: 'Alert',
        kind: 'announcement',
        idempotency_key: idempKey,
        metadata: {
          source: 'ig-accounts-sync',
          event: 'enumeration_failed',
          error: errorMessage,
        },
      })
      .select('id')
      .single();
    if (!notif) return;

    // Fan out so the alert reaches each super admin's notification surfaces.
    const links = adminIds.map((uid) => ({
      notification_id: notif.id,
      user_id: uid,
    }));
    await supabase.from('user_notifications').insert(links);
  } catch (err) {
    console.warn('[ig-sync] enumeration-failure alert failed:', err);
  }
}

/**
 * Enumerate Facebook Pages + their linked Instagram Business accounts for a
 * given Meta access token via the paginated `GET /me/accounts` page-edge.
 * Returns igUserId → parent-Page info (Page id, Page token, IG username) and an
 * `error` string when enumeration failed (transient failures are retried; the
 * safety cap marks an incomplete enumeration as an error).
 *
 * Extracted so BOTH the primary system-user token AND each extra-portfolio
 * token resolve their own Page edges the same way. A Page edge yields the Page
 * token that IG `graph` insights require, so a department account reachable via
 * its own portfolio's Page routes to 'graph' instead of the
 * 'business_discovery' fallback (a system-user token only sees /me/accounts for
 * Pages its OWN portfolio owns, so the primary token never returns dept Pages).
 */
async function enumeratePageEdges(
  token: string
): Promise<{ pages: Map<string, ParentPageInfo>; error: string | null }> {
  const pages = new Map<string, ParentPageInfo>();
  let error: string | null = null;

  const PAGE_FIELDS =
    'id,name,access_token,instagram_business_account{id,username}';
  const MAX_PAGES = 50; // safety cap: 50 × 100 = 5000 Pages
  const MAX_ATTEMPTS = 3; // per-request retries on transient failure
  let nextUrl: string | null =
    `${GRAPH_API}/me/accounts?fields=${encodeURIComponent(PAGE_FIELDS)}` +
    `&limit=100&access_token=${encodeURIComponent(token)}`;
  let pageCount = 0;

  // Follow paging.next so the Page set is COMPLETE — a truncated list would
  // make a parent-less account on a later page look unowned and misroute it.
  // Each request is retried a few times on transient failure (HTTP 429 /
  // 5xx / network) before the run is marked failed.
  while (nextUrl && pageCount < MAX_PAGES && !error) {
    pageCount++;
    let followUrl: string | null = null; // next page, set when this one succeeds
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // 15s timeout so a hung connection aborts (→ throws → retried as
        // transient) instead of stalling the whole sync inside the loop.
        const meRes = await fetch(nextUrl, {
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        const meJson = (await meRes.json()) as MeAccountsResponse;
        if (!meRes.ok || meJson.error) {
          const msg =
            meJson.error?.message ??
            `Meta /me/accounts returned HTTP ${meRes.status}`;
          // Retry only transient failures; a hard 4xx (other than 429)
          // won't recover, so fail fast without burning retries.
          if (
            (meRes.status === 429 || meRes.status >= 500) &&
            attempt < MAX_ATTEMPTS
          ) {
            await sleep(attempt * 500);
            continue;
          }
          error = msg;
          break;
        }
        for (const page of meJson.data ?? []) {
          const igId = page.instagram_business_account?.id;
          if (!igId) continue;
          pages.set(igId, {
            pageId: page.id,
            pageToken: page.access_token || null,
            igUsername: page.instagram_business_account?.username || null,
          });
        }
        followUrl = meJson.paging?.next ?? null;
        break;
      } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(attempt * 500);
          continue;
        }
        error =
          err instanceof Error ? err.message : 'Failed to call /me/accounts';
        break;
      }
    }
    nextUrl = followUrl;
  }

  // Hit the safety cap with pages still remaining → treat enumeration as
  // incomplete so unclassifiable accounts are skipped, not misrouted.
  if (pageCount >= MAX_PAGES && nextUrl) {
    error =
      error ??
      `/me/accounts exceeded ${MAX_PAGES}-page safety cap; enumeration incomplete`;
  }

  return { pages, error };
}

/**
 * Run a full Instagram account discovery + classification sync.
 *
 * @param serviceClient a service-role Supabase client (RLS-bypassing). Both
 *   `createServiceRoleClient()` (route) and the cron's `svc()` produce one.
 * @param opts.institutionId fallback institution for unmapped accounts.
 * @param opts.igUserIds     restrict to these IG ids; omit to discover all.
 */
export async function runIgAccountsSync(
  serviceClient: SupabaseClient,
  opts: IgSyncOptions = {}
): Promise<IgSyncOutcome> {
  const institutionId = opts.institutionId?.trim() || null;
  const igUserIds = opts.igUserIds;

  // Proven token fallback chain (same as meta-facebook-poll cron):
  // both MESSENGER_PAGE_ACCESS_TOKEN and META_PAGE_ACCESS_TOKEN are
  // verified present in prod, bound to JKKN Institutions App 437028995095541.
  const accessToken =
    process.env.META_IG_SYSTEM_USER_TOKEN ||
    process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      ok: false,
      code: 'no_token',
      error:
        'No Meta access token configured (META_IG_SYSTEM_USER_TOKEN / MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN)',
    };
  }

  // Step 1: enumerate Pages + linked IG accounts via /me/accounts. This
  // serves two purposes: auto-discovery when no explicit ig_user_ids are
  // given, AND parent-page resolution (per-page token + fb_pages →
  // institution_id) for the upsert. A failure here is non-fatal when
  // explicit ig_user_ids were provided.
  // Primary token: enumerate its Pages + linked IG accounts. A resolved parent
  // Page is what routes an account to 'graph' (full insights via the Page
  // token); `meAccountsError` gates the "skip unclassifiable accounts" logic
  // below, so it reflects the PRIMARY enumeration only (extra-portfolio
  // enumeration failures are non-critical — see Step 1b).
  const parentPageByIgId = new Map<string, ParentPageInfo>();
  const primaryEdges = await enumeratePageEdges(accessToken);
  for (const [igId, info] of primaryEdges.pages) {
    parentPageByIgId.set(igId, info);
  }
  const meAccountsError: string | null = primaryEdges.error;

  if (meAccountsError) {
    console.warn('[ig-sync] /me/accounts enumeration failed:', meAccountsError);
    await alertEnumerationFailure(serviceClient, meAccountsError);
  }

  // Step 1b: extra portfolios. Department accounts are owned by OTHER
  // Business Portfolios (e.g. "JKKN All Departments"), each with its own
  // token — a system-user token only reads its own portfolio's assets. For
  // each portfolio we FIRST resolve its Page edges (with its own token) so a
  // Page-connected department account routes to 'graph' (full insights via the
  // Page token), THEN fall back to owned_instagram_accounts for any account
  // without a reachable Page — stored as 'business_discovery' with the
  // per-account token the discovery poller reads.
  const extraByIgId = new Map<string, { token: string; username: string | null }>();
  for (const portfolio of getExtraIgPortfolios()) {
    // Page-edge resolution with THIS portfolio's own token. A resolved Page
    // yields the Page token that IG graph insights require — the reason the
    // owned_instagram_accounts-only path below can't reach 'graph' (a bare
    // business/user token hits the documented insights error 33). Non-critical:
    // a failure just leaves the account on the business_discovery fallback.
    try {
      const { pages: extraPages, error: extraPagesError } =
        await enumeratePageEdges(portfolio.token);
      if (extraPagesError) {
        console.warn(
          `[ig-sync] extra-portfolio ${portfolio.businessId} /me/accounts failed (non-critical):`,
          extraPagesError
        );
      }
      // Primary-token edges win if somehow present; portfolios are otherwise
      // disjoint by ownership, so in practice this only ADDS department Pages.
      for (const [igId, info] of extraPages) {
        if (!parentPageByIgId.has(igId)) parentPageByIgId.set(igId, info);
      }
    } catch (err) {
      console.warn(
        `[ig-sync] extra-portfolio ${portfolio.businessId} page-edge resolution failed (non-critical):`,
        err
      );
    }

    // owned_instagram_accounts fallback: any account NOT resolved as a Page
    // edge above still surfaces (as 'business_discovery') so nothing is dropped.
    try {
      const summaries = await discoverAccounts(portfolio.businessId, {
        accessToken: portfolio.token,
        apiVersion: GRAPH_VERSION,
      });
      for (const s of summaries) {
        if (!extraByIgId.has(s.id)) {
          extraByIgId.set(s.id, { token: portfolio.token, username: s.username || null });
        }
      }
    } catch (err) {
      console.warn(`[ig-sync] extra-portfolio ${portfolio.businessId} discovery failed:`, err);
    }
  }

  // institution_id per department handle, from the social_dept_accounts
  // registry (PR #1292). Department accounts have no fb_pages parent, so this
  // is their institution source — both extra-portfolio accounts AND page-edge
  // accounts (whose Page is now in /me/accounts but isn't seeded into
  // fb_pages). Always loaded (not gated on extra portfolios) so page-edge
  // dept accounts resolve their institution instead of being skipped.
  const deptInstitutionByUsername = new Map<string, string>();
  {
    const { data: deptRows } = await serviceClient
      .from('social_dept_accounts')
      .select('username, institution_id')
      .not('institution_id', 'is', null);
    for (const row of deptRows || []) {
      if (row.username && row.institution_id) {
        deptInstitutionByUsername.set(row.username as string, row.institution_id as string);
      }
    }
  }

  // Determine which IG user IDs to sync
  const targetIds: string[] =
    igUserIds && igUserIds.length > 0
      ? igUserIds
      : Array.from(new Set([...parentPageByIgId.keys(), ...extraByIgId.keys()]));

  if (targetIds.length === 0) {
    if (meAccountsError) {
      return { ok: false, code: 'enumeration_failed', error: meAccountsError };
    }
    return { ok: true, data: { synced: 0, failed: 0, total: 0, results: [] } };
  }

  // Resolve institution_id per parent Page from fb_pages (seeded with the
  // correct mapping by the meta-facebook-poll cron, PR #1246). One batched
  // query; fall back to the request's institution_id when no match.
  const institutionByPageId = new Map<string, string>();
  const parentPageIds = Array.from(
    new Set(
      targetIds
        .map((igId) => parentPageByIgId.get(igId)?.pageId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (parentPageIds.length > 0) {
    const { data: fbPageRows } = await serviceClient
      .from('fb_pages')
      .select('fb_page_id, institution_id')
      .in('fb_page_id', parentPageIds);
    for (const row of fbPageRows || []) {
      if (row.fb_page_id && row.institution_id) {
        institutionByPageId.set(row.fb_page_id as string, row.institution_id as string);
      }
    }
  }

  const results: IgSyncAccountResult[] = [];
  let synced = 0;
  let failed = 0;

  // Fetch each account profile and upsert into ig_accounts.
  // Per-account failures must not abort the loop.
  await Promise.all(
    targetIds.map(async (igUserId) => {
      try {
        const parent = parentPageByIgId.get(igUserId);
        const extra = extraByIgId.get(igUserId);
        // Ownership is known only when /me/accounts enumeration succeeded
        // (parent presence is then authoritative) OR the account came from an
        // extra portfolio. A found `parent` is itself authoritative — even if
        // enumeration later failed mid-pagination, an account we DID resolve a
        // Page for is known to be page-owned. The unknown case is: enumeration
        // failed AND this account has neither a found parent nor an extra
        // entry (e.g. an explicit-ids sync where /me/accounts never returned
        // its Page). We skip such an account rather than guess: an INSERT
        // would take the 'graph' NOT-NULL default (orphaning a dept account),
        // and an UPDATE would downgrade an existing 'graph' row and null its
        // access_token. A later sync (once /me/accounts succeeds) classifies
        // it. Past this guard, ownership is always known so metrics_source
        // below can be written unconditionally.
        const ownershipKnown = !meAccountsError || Boolean(parent) || Boolean(extra);
        if (!ownershipKnown) {
          results.push({
            ig_user_id: igUserId,
            username: parent?.igUsername || '',
            status: 'error',
            error:
              '/me/accounts enumeration failed — cannot classify account ownership; retry once enumeration succeeds',
          });
          failed++;
          return;
        }
        // Token precedence: page token (owned-via-Page) → extra-portfolio
        // token (department account) → primary system token.
        const igToken = parent?.pageToken || extra?.token || accessToken;

        const igProfile = await getAccountProfile(igUserId, {
          accessToken: igToken,
          apiVersion: GRAPH_VERSION,
        });

        const now = new Date().toISOString();
        const resolvedInstitutionId =
          (parent?.pageId && institutionByPageId.get(parent.pageId)) ||
          (igProfile.username
            ? deptInstitutionByUsername.get(igProfile.username)
            : undefined) ||
          institutionId;
        if (!resolvedInstitutionId) {
          // institution_id is NOT NULL on ig_accounts. No fb_pages parent
          // mapping and no body fallback (super_admin group-level sync) —
          // skip rather than fail the insert.
          results.push({
            ig_user_id: igUserId,
            username: parent?.igUsername || '',
            status: 'error',
            error:
              'no institution mapping: account has no fb_pages parent and no institution_id was provided',
          });
          failed++;
          return;
        }
        const accountType =
          igProfile.account_type && VALID_ACCOUNT_TYPES.has(igProfile.account_type)
            ? igProfile.account_type
            : 'BUSINESS';

        // Only columns that exist on ig_accounts (migrations 20260530140000
        // + 20260609000726). Follower/media counts belong to
        // ig_account_metrics and are written by the metrics poller cron.
        const { data: upserted, error: upsertError } = await serviceClient
          .from('ig_accounts')
          .upsert(
            {
              institution_id: resolvedInstitutionId,
              ig_user_id: igProfile.id,
              username: igProfile.username || parent?.igUsername || igUserId,
              account_type: accountType,
              status: 'active',
              // metrics_source routing (migration 20260610160000). Ownership
              // is guaranteed known here (unknown accounts were skipped above):
              //   - Page-owned (`parent`, from /me/accounts) → 'graph': full
              //     insights via instagram-metrics-poller. Flips an existing
              //     business_discovery row on the onConflict UPDATE; the
              //     ig-business-discovery poll skips 'graph' so it sticks.
              //   - Extra-portfolio (owned_instagram_accounts, no Page →
              //     graph insights 33-error) → 'business_discovery' so the
              //     discovery poll keeps polling them.
              metrics_source: parent ? 'graph' : 'business_discovery',
              access_token: parent?.pageToken || extra?.token || null,
              updated_at: now,
            },
            { onConflict: 'ig_user_id', ignoreDuplicates: false }
          )
          .select('id')
          .maybeSingle();

        if (upsertError) {
          results.push({
            ig_user_id: igProfile.id,
            username: igProfile.username || '',
            status: 'error',
            error: upsertError.message,
          });
          failed++;
          return;
        }

        // For department accounts, link the registry row so the
        // /admin/social/departments chip flips to "Monitored". Non-fatal.
        // Gate on dept-registry membership (not `extra`) so page-edge dept
        // accounts — whose Page is in /me/accounts, so they arrive as a
        // `parent` with no `extra` portfolio entry — also get linked.
        if (
          upserted?.id &&
          igProfile.username &&
          deptInstitutionByUsername.has(igProfile.username)
        ) {
          const { error: linkError } = await serviceClient
            .from('social_dept_accounts')
            .update({ ig_account_id: upserted.id, updated_at: now })
            .eq('username', igProfile.username);
          if (linkError) {
            console.warn(
              `[ig-sync] failed to link social_dept_accounts for ${igProfile.username}:`,
              linkError.message
            );
          }
        }

        results.push({
          ig_user_id: igProfile.id,
          username: igProfile.username || '',
          status: 'upserted',
        });
        synced++;
      } catch (err) {
        results.push({
          ig_user_id: igUserId,
          username: '',
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        failed++;
      }
    })
  );

  const responsePayload: IgSyncData = {
    synced,
    failed,
    total: targetIds.length,
    results,
  };

  await writeLog(serviceClient, {
    event_type: 'sync',
    status: failed > 0 && synced === 0 ? 'error' : 'success',
    payload: {
      endpoint: '/api/social/instagram/accounts/sync',
      institution_id: institutionId,
      ig_user_ids: igUserIds ?? null,
      synced,
      failed,
      total: targetIds.length,
    },
    error_message: failed > 0 ? `${failed} account(s) failed to sync` : null,
  });

  console.info(`[ig-sync] synced=${synced} failed=${failed} total=${targetIds.length}`);

  return { ok: true, data: responsePayload };
}
