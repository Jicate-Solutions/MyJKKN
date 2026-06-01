export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/accounts/discover
 *
 * Enumerates all Instagram Professional accounts accessible under the
 * configured Meta Business Manager token. Returns each account with a flag
 * indicating whether it is already synced into ig_accounts.
 *
 * Auth: super_admin OR institution_admin scoped to requested institution_id.
 *
 * Stub note: lib/instagram/api-client.ts (Agent α) is not yet merged.
 * Direct Graph API calls are made here until that client is available.
 * When Agent α merges, replace the inline fetch calls with
 * `IgApiClient.getAccountsForBusiness(businessId, token)`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// --- Inline stub types (replaces lib/instagram/api-client.ts when Agent α merges) ---
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
// --- End stub ---

async function writeLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    institution_id: string | null;
    endpoint: string;
    method: string;
    request_payload: Record<string, unknown>;
    response_status: number;
    response_body: Record<string, unknown>;
    error_message: string | null;
  }
) {
  // social_instagram_logs is created by Agent β. If the table is not yet applied
  // this insert fails silently — acceptable during parallel build.
  await supabase.from('social_instagram_logs').insert({
    institution_id: params.institution_id,
    endpoint: params.endpoint,
    method: params.method,
    request_payload: params.request_payload,
    response_status: params.response_status,
    response_body: params.response_body,
    error_message: params.error_message,
  }).then(() => {}).catch((err: unknown) => {
    console.warn('[ig-discover] Log write failed (table may not exist yet):', err);
  });
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

    if (!isSuperAdmin && !isInstitutionAdmin) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'INSTAGRAM_ACCESS_TOKEN not configured' },
        { status: 503 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const logStart = Date.now();

    // Step 1: Resolve Business Manager ID(s) from token
    const businessIdSet = new Set<string>();

    // Method A: env var
    const envBusinessId = process.env.META_BUSINESS_MANAGER_ID;
    if (envBusinessId) businessIdSet.add(envBusinessId);

    // Method B: token debug to find app → business
    try {
      const debugRes = await fetch(
        `${GRAPH_API}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
      );
      const debugData = await debugRes.json();
      const appId = debugData.data?.app_id;
      if (appId) {
        const appRes = await fetch(
          `${GRAPH_API}/${appId}?fields=business&access_token=${accessToken}`
        );
        const appData = await appRes.json();
        if (appData.business?.id) businessIdSet.add(appData.business.id);
      }
    } catch {
      // Non-critical
    }

    // Method C: /me to get system user, then their businesses
    try {
      const meRes = await fetch(`${GRAPH_API}/me?fields=id&access_token=${accessToken}`);
      const meData = await meRes.json();
      if (meData.id) {
        const bizRes = await fetch(
          `${GRAPH_API}/${meData.id}/businesses?access_token=${accessToken}`
        );
        const bizData = await bizRes.json();
        for (const biz of bizData.data || []) {
          businessIdSet.add(biz.id);
        }
      }
    } catch {
      // Non-critical
    }

    const businessIds = Array.from(businessIdSet);

    // Step 2: For each Business, enumerate connected Instagram accounts
    const discovered: DiscoveredIgAccount[] = [];

    for (const bizId of businessIds) {
      try {
        // Get owned pages, then get the connected IG account for each page
        const pagesRes = await fetch(
          `${GRAPH_API}/${bizId}/owned_pages?fields=id,name,instagram_business_account&access_token=${accessToken}`
        );
        const pagesData = await pagesRes.json();

        for (const page of pagesData.data || []) {
          const igAccountId = page.instagram_business_account?.id;
          if (!igAccountId) continue;

          try {
            const fields = [
              'id',
              'username',
              'name',
              'biography',
              'profile_picture_url',
              'followers_count',
              'follows_count',
              'media_count',
              'website',
              'account_type',
            ].join(',');

            const igRes = await fetch(
              `${GRAPH_API}/${igAccountId}?fields=${fields}&access_token=${accessToken}`
            );
            const igData = await igRes.json();

            if (igData.error) {
              console.warn(`[ig-discover] IG account ${igAccountId} error:`, igData.error.message);
              continue;
            }

            discovered.push({
              ig_user_id: igData.id,
              username: igData.username || '',
              name: igData.name || '',
              biography: igData.biography || null,
              profile_picture_url: igData.profile_picture_url || null,
              followers_count: igData.followers_count ?? null,
              follows_count: igData.follows_count ?? null,
              media_count: igData.media_count ?? null,
              website: igData.website || null,
              account_type: igData.account_type || null,
              business_page_id: page.id || null,
              already_synced: false,
            });
          } catch (err) {
            console.warn(`[ig-discover] Failed to fetch IG account ${igAccountId}:`, err);
          }
        }
      } catch (err) {
        console.warn(`[ig-discover] Failed to enumerate pages for business ${bizId}:`, err);
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
      business_count: businessIds.length,
    };

    await writeLog(serviceClient, {
      institution_id: institutionId,
      endpoint: '/api/social/instagram/accounts/discover',
      method: 'GET',
      request_payload: { institution_id: institutionId },
      response_status: 200,
      response_body: { total: responsePayload.total, business_count: responsePayload.business_count },
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
