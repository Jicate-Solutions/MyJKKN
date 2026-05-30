export const dynamic = 'force-dynamic';

/**
 * POST /api/social/instagram/accounts/sync
 *
 * Syncs discovered Instagram Professional accounts into the ig_accounts table.
 * Upserts on ig_user_id — safe to call repeatedly (idempotent).
 *
 * Body:
 *   institution_id: string   — institution to associate accounts with
 *   ig_user_ids?: string[]   — optional: only sync these specific account IDs
 *                              (omit to sync all discovered accounts)
 *
 * Auth: super_admin OR institution_admin scoped to institution_id in body.
 *
 * Stub note: lib/instagram/api-client.ts (Agent α) is not yet merged.
 * Direct Graph API calls are used here. When Agent α merges, replace the
 * inline fetch with `IgApiClient.getAccountFields(ig_user_id, token)`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

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
  await supabase.from('social_instagram_logs').insert({
    institution_id: params.institution_id,
    endpoint: params.endpoint,
    method: params.method,
    request_payload: params.request_payload,
    response_status: params.response_status,
    response_body: params.response_body,
    error_message: params.error_message,
  }).then(() => {}).catch((err: unknown) => {
    console.warn('[ig-sync] Log write failed (table may not exist yet):', err);
  });
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

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'INSTAGRAM_ACCESS_TOKEN not configured' },
        { status: 503 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Determine which IG user IDs to sync
    let targetIds: string[] = body.ig_user_ids || [];

    if (targetIds.length === 0) {
      // No explicit list — call discover logic to get all available IDs
      // We call the Graph API to get accounts linked to our business
      const businessId = process.env.META_BUSINESS_MANAGER_ID;
      if (!businessId) {
        return NextResponse.json(
          { success: false, error: 'META_BUSINESS_MANAGER_ID not configured; provide ig_user_ids explicitly' },
          { status: 400 }
        );
      }

      try {
        const pagesRes = await fetch(
          `${GRAPH_API}/${businessId}/owned_pages?fields=id,instagram_business_account&access_token=${accessToken}`
        );
        const pagesData = await pagesRes.json();
        for (const page of pagesData.data || []) {
          if (page.instagram_business_account?.id) {
            targetIds.push(page.instagram_business_account.id);
          }
        }
      } catch (err) {
        console.warn('[ig-sync] Failed to auto-discover target IDs:', err);
      }
    }

    if (targetIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { synced: 0, failed: 0, total: 0, results: [] },
      });
    }

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

    const results: SyncResult[] = [];
    let synced = 0;
    let failed = 0;

    // Fetch each account from Graph API and upsert into ig_accounts
    await Promise.all(
      targetIds.map(async (igUserId) => {
        try {
          const igRes = await fetch(
            `${GRAPH_API}/${igUserId}?fields=${fields}&access_token=${accessToken}`
          );
          const igData = await igRes.json();

          if (igData.error) {
            results.push({
              ig_user_id: igUserId,
              username: '',
              status: 'error',
              error: igData.error.message,
            });
            failed++;
            return;
          }

          const now = new Date().toISOString();

          const { error: upsertError } = await serviceClient
            .from('ig_accounts')
            .upsert(
              {
                institution_id: institutionId,
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
                is_active: true,
                last_synced_at: now,
                updated_at: now,
              },
              { onConflict: 'ig_user_id', ignoreDuplicates: false }
            );

          if (upsertError) {
            results.push({
              ig_user_id: igData.id,
              username: igData.username || '',
              status: 'error',
              error: upsertError.message,
            });
            failed++;
            return;
          }

          results.push({
            ig_user_id: igData.id,
            username: igData.username || '',
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
      institution_id: institutionId,
      endpoint: '/api/social/instagram/accounts/sync',
      method: 'POST',
      request_payload: { institution_id: institutionId, ig_user_ids: body.ig_user_ids },
      response_status: 200,
      response_body: { synced, failed, total: targetIds.length },
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
