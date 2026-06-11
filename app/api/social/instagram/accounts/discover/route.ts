export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/accounts/discover
 *
 * Enumerates all Instagram Professional accounts linked to the Facebook
 * Pages the configured token can manage (`GET /me/accounts`), mirroring the
 * proven discovery pattern in app/api/cron/meta-facebook-poll/route.ts.
 * Returns each account with a flag indicating whether it is already synced
 * into ig_accounts.
 *
 * Auth: super_admin OR institution_admin scoped to requested institution_id.
 *
 * Uses lib/instagram/api-client.ts (merged in PR #1147) for per-account
 * profile hydration. Discovery runs three sources, each degrading silently:
 *   - Step 1/2  page-edge: GET /me/accounts → each Page's linked IG account.
 *   - Step 2b   primary business: owned_instagram_accounts of
 *               META_BUSINESS_MANAGER_ID (the portfolio the token belongs to).
 *   - Step 2d   extra portfolios: for each {businessId, token} in
 *               META_IG_EXTRA_PORTFOLIOS, owned_instagram_accounts queried with
 *               THAT portfolio's own token. A system-user token can only read
 *               assets its own portfolio owns, so accounts owned by other
 *               portfolios (e.g. the department accounts in "JKKN All
 *               Departments") need their own token — see extra-portfolios.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { discoverAccounts, getAccountProfile } from '@/lib/instagram/api-client';
import { getExtraIgPortfolios } from '@/lib/instagram/extra-portfolios';

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const GRAPH_VERSION = 'v25.0';

interface IgAccount {
  ig_user_id: string;
  username: string;
  name: string;
  biography: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  website: string | null;
  account_type: string | null;
  business_page_id: string | null;
}

interface DiscoveredIgAccount extends IgAccount {
  already_synced: boolean;
}

interface MeAccountsPage {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
}

interface MeAccountsResponse {
  data?: MeAccountsPage[];
  error?: { message?: string; code?: number; type?: string };
}

// social_instagram_logs columns: account_id, event_type, payload, status,
// error_message, occurred_at (see migration 20260530140000). Fail-silent —
// a log failure must never break discovery.
async function writeLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
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
    console.warn('[ig-discover] Log write failed:', err);
  }
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

    // Auth gate: super_admin passes unconditionally; institution_admin must match
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.role === 'super_admin';
    const isInstitutionAdmin =
      profile?.role === 'institution_admin' &&
      (!institutionId || profile?.institution_id === institutionId);

    // 2026-06-11 granular-permission retrofit: roles granted
    // social.instagram.manage via Role Management pass too, under the same
    // institution-match constraint as institution_admin.
    let hasManagePerm = false;
    if (
      !isSuperAdmin &&
      !isInstitutionAdmin &&
      (!institutionId || profile?.institution_id === institutionId)
    ) {
      const { data: perm } = await supabase.rpc('user_has_permission', {
        permission_name: 'social.instagram.manage',
      });
      hasManagePerm = !!perm;
    }

    if (!isSuperAdmin && !isInstitutionAdmin && !hasManagePerm) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Proven token fallback chain (same as meta-facebook-poll cron):
    // both MESSENGER_PAGE_ACCESS_TOKEN and META_PAGE_ACCESS_TOKEN are
    // verified present in prod, bound to JKKN Institutions App 437028995095541.
    const accessToken =
      process.env.META_IG_SYSTEM_USER_TOKEN ||
      process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
      process.env.META_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No Meta access token configured (META_IG_SYSTEM_USER_TOKEN / MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN)',
        },
        { status: 503 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const logStart = Date.now();

    // Step 1: Page-edge discovery — GET /me/accounts with the linked IG
    // business account on each Page. No business-manager id required.
    const pages: MeAccountsPage[] = [];
    const meAccountsUrl =
      `${GRAPH_API}/me/accounts` +
      `?fields=id,name,access_token,instagram_business_account{id,username}` +
      `&limit=100&access_token=${encodeURIComponent(accessToken)}`;

    const meRes = await fetch(meAccountsUrl, { cache: 'no-store' });
    const meJson = (await meRes.json()) as MeAccountsResponse;
    if (!meRes.ok || meJson.error) {
      const msg = meJson.error?.message ?? `Meta /me/accounts returned HTTP ${meRes.status}`;
      await writeLog(serviceClient, {
        event_type: 'discover',
        status: 'error',
        payload: { endpoint: '/me/accounts', institution_id: institutionId },
        error_message: msg,
      });
      return NextResponse.json({ success: false, error: msg }, { status: 502 });
    }
    pages.push(...(meJson.data ?? []));

    // Step 2: hydrate the full profile for every linked IG account.
    // Per-account failures are logged and skipped — one bad account must
    // not abort the sweep.
    const discovered: DiscoveredIgAccount[] = [];
    const seenIgIds = new Set<string>();

    for (const page of pages) {
      const igAccountId = page.instagram_business_account?.id;
      if (!igAccountId || seenIgIds.has(igAccountId)) continue;
      seenIgIds.add(igAccountId);

      try {
        const igProfile = await getAccountProfile(igAccountId, {
          accessToken: page.access_token || accessToken,
          apiVersion: GRAPH_VERSION,
        });

        discovered.push({
          ig_user_id: igProfile.id,
          username: igProfile.username || page.instagram_business_account?.username || '',
          name: igProfile.name || '',
          biography: igProfile.biography || null,
          profile_picture_url: igProfile.profile_picture_url || null,
          followers_count: igProfile.followers_count ?? null,
          follows_count: igProfile.follows_count ?? null,
          media_count: igProfile.media_count ?? null,
          website: igProfile.website || null,
          account_type: igProfile.account_type || null,
          business_page_id: page.id || null,
          already_synced: false,
        });
      } catch (err) {
        console.warn(`[ig-discover] Failed to fetch IG account ${igAccountId}:`, err);
      }
    }

    // Step 2b (optional): Business-Manager supplement. Only runs when
    // META_BUSINESS_MANAGER_ID is configured; degrades silently otherwise.
    const envBusinessId = process.env.META_BUSINESS_MANAGER_ID;
    if (envBusinessId) {
      try {
        const summaries = await discoverAccounts(envBusinessId, {
          accessToken,
          apiVersion: GRAPH_VERSION,
        });
        for (const summary of summaries) {
          if (seenIgIds.has(summary.id)) continue;
          seenIgIds.add(summary.id);
          try {
            const igProfile = await getAccountProfile(summary.id, {
              accessToken,
              apiVersion: GRAPH_VERSION,
            });
            discovered.push({
              ig_user_id: igProfile.id,
              username: igProfile.username || summary.username || '',
              name: igProfile.name || '',
              biography: igProfile.biography || null,
              profile_picture_url: igProfile.profile_picture_url || null,
              followers_count: igProfile.followers_count ?? null,
              follows_count: igProfile.follows_count ?? null,
              media_count: igProfile.media_count ?? null,
              website: igProfile.website || null,
              account_type: igProfile.account_type || null,
              business_page_id: null,
              already_synced: false,
            });
          } catch (err) {
            console.warn(`[ig-discover] Failed to fetch IG account ${summary.id}:`, err);
          }
        }
      } catch (err) {
        console.warn(`[ig-discover] Business-manager supplement failed (non-critical):`, err);
      }
    }

    // Step 2d (optional): extra-portfolio supplement. For each {businessId,
    // token} in META_IG_EXTRA_PORTFOLIOS, run the SAME owned_instagram_accounts
    // path as Step 2b but with that portfolio's OWN token — a system-user token
    // can only read assets its own portfolio owns. This is how the department
    // accounts (owned by "JKKN All Departments", not JKKN Institutions) surface.
    // Same dedup (seenIgIds), same per-account + per-portfolio non-critical
    // degradation. Tokens stay server-side; never added to the response.
    for (const portfolio of getExtraIgPortfolios()) {
      try {
        const summaries = await discoverAccounts(portfolio.businessId, {
          accessToken: portfolio.token,
          apiVersion: GRAPH_VERSION,
        });
        for (const summary of summaries) {
          if (seenIgIds.has(summary.id)) continue;
          seenIgIds.add(summary.id);
          try {
            const igProfile = await getAccountProfile(summary.id, {
              accessToken: portfolio.token,
              apiVersion: GRAPH_VERSION,
            });
            discovered.push({
              ig_user_id: igProfile.id,
              username: igProfile.username || summary.username || '',
              name: igProfile.name || '',
              biography: igProfile.biography || null,
              profile_picture_url: igProfile.profile_picture_url || null,
              followers_count: igProfile.followers_count ?? null,
              follows_count: igProfile.follows_count ?? null,
              media_count: igProfile.media_count ?? null,
              website: igProfile.website || null,
              account_type: igProfile.account_type || null,
              business_page_id: null,
              already_synced: false,
            });
          } catch (err) {
            console.warn(
              `[ig-discover] Failed to fetch extra-portfolio IG account ${summary.id}:`,
              err
            );
          }
        }
      } catch (err) {
        console.warn(
          `[ig-discover] Extra-portfolio supplement failed for ${portfolio.businessId} (non-critical):`,
          err
        );
      }
    }

    // Step 3: Check which accounts are already synced in ig_accounts
    if (discovered.length > 0) {
      let existingQuery = serviceClient.from('ig_accounts').select('ig_user_id');
      if (institutionId) {
        existingQuery = existingQuery.eq('institution_id', institutionId);
      }
      const { data: existing } = await existingQuery;
      const existingIds = new Set((existing || []).map((e: { ig_user_id: string }) => e.ig_user_id));
      for (const acct of discovered) {
        acct.already_synced = existingIds.has(acct.ig_user_id);
      }
    }

    const responsePayload = {
      discovered,
      total: discovered.length,
      already_synced: discovered.filter((d) => d.already_synced).length,
      available: discovered.filter((d) => !d.already_synced).length,
      pages_scanned: pages.length,
    };

    await writeLog(serviceClient, {
      event_type: 'discover',
      status: 'success',
      payload: {
        endpoint: '/api/social/instagram/accounts/discover',
        institution_id: institutionId,
        total: responsePayload.total,
        pages_scanned: responsePayload.pages_scanned,
        duration_ms: Date.now() - logStart,
      },
      error_message: null,
    });

    console.info(`[ig-discover] ${discovered.length} accounts found in ${Date.now() - logStart}ms`);

    return NextResponse.json({ success: true, data: responsePayload });
  } catch (error) {
    console.error('[ig-discover] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Discovery failed' },
      { status: 500 }
    );
  }
}
