export const dynamic = 'force-dynamic';

/**
 * POST /api/social/instagram/accounts/sync
 *
 * Syncs discovered Instagram Professional accounts into the ig_accounts table.
 * Upserts on ig_user_id — safe to call repeatedly (idempotent).
 *
 * Body:
 *   institution_id: string   — fallback institution to associate accounts with
 *   ig_user_ids?: string[]   — optional: only sync these specific account IDs
 *                              (omit to sync all accounts linked to our Pages)
 *
 * Auth: super_admin OR institution_admin scoped to institution_id in body.
 *
 * Discovery uses the proven `GET /me/accounts` page-edge pattern from
 * app/api/cron/meta-facebook-poll/route.ts (no business-manager id needed).
 * Per-account profile hydration uses lib/instagram/api-client.ts
 * (merged in PR #1147). institution_id is resolved from the parent Page via
 * fb_pages (fb_page_id → institution_id) before falling back to the body's
 * institution_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAccountProfile } from '@/lib/instagram/api-client';

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
  error?: { message?: string; code?: number; type?: string };
}

interface ParentPageInfo {
  pageId: string;
  pageToken: string | null;
  igUsername: string | null;
}

// social_instagram_logs columns: account_id, event_type, payload, status,
// error_message, occurred_at (see migration 20260530140000). Fail-silent —
// a log failure must never break the sync.
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
    console.warn('[ig-sync] Log write failed:', err);
  }
}

interface SyncResult {
  ig_user_id: string;
  username: string;
  status: 'upserted' | 'error';
  error?: string;
}

export async function POST(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as {
      institution_id?: string;
      ig_user_ids?: string[];
    };

    const institutionId = body.institution_id;
    if (!institutionId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'institution_id is required' },
        { status: 400 }
      );
    }

    // Auth gate
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.role === 'super_admin';
    const isInstitutionAdmin =
      profile?.role === 'institution_admin' && profile?.institution_id === institutionId;

    if (!isSuperAdmin && !isInstitutionAdmin) {
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

    // Step 1: enumerate Pages + linked IG accounts via /me/accounts. This
    // serves two purposes: auto-discovery when no explicit ig_user_ids are
    // given, AND parent-page resolution (per-page token + fb_pages →
    // institution_id) for the upsert. A failure here is non-fatal when
    // explicit ig_user_ids were provided.
    const parentPageByIgId = new Map<string, ParentPageInfo>();
    let meAccountsError: string | null = null;

    try {
      const meAccountsUrl =
        `${GRAPH_API}/me/accounts` +
        `?fields=id,name,access_token,instagram_business_account{id,username}` +
        `&limit=100&access_token=${encodeURIComponent(accessToken)}`;
      const meRes = await fetch(meAccountsUrl, { cache: 'no-store' });
      const meJson = (await meRes.json()) as MeAccountsResponse;
      if (!meRes.ok || meJson.error) {
        meAccountsError =
          meJson.error?.message ?? `Meta /me/accounts returned HTTP ${meRes.status}`;
      } else {
        for (const page of meJson.data ?? []) {
          const igId = page.instagram_business_account?.id;
          if (!igId) continue;
          parentPageByIgId.set(igId, {
            pageId: page.id,
            pageToken: page.access_token || null,
            igUsername: page.instagram_business_account?.username || null,
          });
        }
      }
    } catch (err) {
      meAccountsError = err instanceof Error ? err.message : 'Failed to call /me/accounts';
    }

    if (meAccountsError) {
      console.warn('[ig-sync] /me/accounts enumeration failed:', meAccountsError);
    }

    // Determine which IG user IDs to sync
    const targetIds: string[] =
      body.ig_user_ids && body.ig_user_ids.length > 0
        ? body.ig_user_ids
        : Array.from(parentPageByIgId.keys());

    if (targetIds.length === 0) {
      if (meAccountsError) {
        return NextResponse.json(
          { success: false, error: `Account enumeration failed: ${meAccountsError}` },
          { status: 502 }
        );
      }
      return NextResponse.json({
        success: true,
        data: { synced: 0, failed: 0, total: 0, results: [] },
      });
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

    const results: SyncResult[] = [];
    let synced = 0;
    let failed = 0;

    // Fetch each account profile and upsert into ig_accounts.
    // Per-account failures must not abort the loop.
    await Promise.all(
      targetIds.map(async (igUserId) => {
        try {
          const parent = parentPageByIgId.get(igUserId);

          const igProfile = await getAccountProfile(igUserId, {
            accessToken: parent?.pageToken || accessToken,
            apiVersion: GRAPH_VERSION,
          });

          const now = new Date().toISOString();
          const resolvedInstitutionId =
            (parent?.pageId && institutionByPageId.get(parent.pageId)) || institutionId;
          const accountType =
            igProfile.account_type && VALID_ACCOUNT_TYPES.has(igProfile.account_type)
              ? igProfile.account_type
              : 'BUSINESS';

          // Only columns that exist on ig_accounts (migrations 20260530140000
          // + 20260609000726). Follower/media counts belong to
          // ig_account_metrics and are written by the metrics poller cron.
          const { error: upsertError } = await serviceClient
            .from('ig_accounts')
            .upsert(
              {
                institution_id: resolvedInstitutionId,
                ig_user_id: igProfile.id,
                username: igProfile.username || parent?.igUsername || igUserId,
                account_type: accountType,
                status: 'active',
                access_token: parent?.pageToken || null,
                updated_at: now,
              },
              { onConflict: 'ig_user_id', ignoreDuplicates: false }
            );

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

    const responsePayload = {
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
        ig_user_ids: body.ig_user_ids ?? null,
        synced,
        failed,
        total: targetIds.length,
      },
      error_message: failed > 0 ? `${failed} account(s) failed to sync` : null,
    });

    console.info(`[ig-sync] synced=${synced} failed=${failed} total=${targetIds.length}`);

    return NextResponse.json({ success: true, data: responsePayload });
  } catch (error) {
    console.error('[ig-sync] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
