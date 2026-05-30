export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/account-profile
 *
 * Fetches the live profile for a single Instagram account via the Graph API,
 * then updates the ig_accounts row with fresh data.
 *
 * Query params:
 *   ig_user_id: string        — required; the IG Professional account ID
 *   institution_id?: string   — required for institution_admin auth check
 *
 * Auth: super_admin OR institution_admin whose institution owns the ig_account.
 *
 * Stub note: lib/instagram/api-client.ts (Agent α) is not yet merged.
 * Direct Graph API calls used here. When Agent α merges, replace the inline
 * fetch with `IgApiClient.getAccountProfile(ig_user_id, token)`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

const IG_PROFILE_FIELDS = [
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
  'ig_id',
].join(',');

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
    console.warn('[ig-profile] Log write failed (table may not exist yet):', err);
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
    const igUserId = searchParams.get('ig_user_id');
    const institutionId = searchParams.get('institution_id');

    if (!igUserId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'ig_user_id is required' },
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
    const isInstitutionAdmin = profile?.role === 'institution_admin';

    if (!isSuperAdmin && !isInstitutionAdmin) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const serviceClient = createServiceRoleClient();

    // Fetch the ig_accounts row to verify ownership and get institution context
    const { data: igAccount, error: accountError } = await serviceClient
      .from('ig_accounts')
      .select('ig_user_id, username, institution_id, is_active')
      .eq('ig_user_id', igUserId)
      .maybeSingle();

    if (accountError) {
      console.error('[ig-profile] DB fetch error:', accountError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch account record' },
        { status: 500 }
      );
    }

    if (!igAccount) {
      return NextResponse.json(
        { success: false, error: `No ig_account found for ig_user_id "${igUserId}"` },
        { status: 404 }
      );
    }

    // institution_admin: must match the account's institution_id
    if (isInstitutionAdmin) {
      const effectiveInstId = institutionId || profile?.institution_id;
      if (igAccount.institution_id !== effectiveInstId) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'INSTAGRAM_ACCESS_TOKEN not configured' },
        { status: 503 }
      );
    }

    // Fetch live profile from Graph API
    const igRes = await fetch(
      `${GRAPH_API}/${igUserId}?fields=${IG_PROFILE_FIELDS}&access_token=${accessToken}`
    );
    const igData = await igRes.json();

    if (igData.error) {
      await writeLog(serviceClient, {
        institution_id: igAccount.institution_id,
        endpoint: '/api/social/instagram/account-profile',
        method: 'GET',
        request_payload: { ig_user_id: igUserId },
        response_status: igRes.status,
        response_body: { meta_error: igData.error },
        error_message: igData.error.message,
      });

      return NextResponse.json(
        { success: false, error: `Meta API error: ${igData.error.message}` },
        { status: igRes.status >= 400 ? igRes.status : 502 }
      );
    }

    // Update ig_accounts with fresh profile data
    const now = new Date().toISOString();
    const { error: updateError } = await serviceClient
      .from('ig_accounts')
      .update({
        username: igData.username || igAccount.username,
        name: igData.name || null,
        biography: igData.biography || null,
        profile_picture_url: igData.profile_picture_url || null,
        followers_count: igData.followers_count ?? null,
        follows_count: igData.follows_count ?? null,
        media_count: igData.media_count ?? null,
        website: igData.website || null,
        account_type: igData.account_type || null,
        last_synced_at: now,
        updated_at: now,
      })
      .eq('ig_user_id', igUserId);

    if (updateError) {
      // Log the failure but still return the live data — the caller gets fresh
      // profile data even if the DB write failed
      console.warn('[ig-profile] Failed to update ig_accounts row:', updateError);
    }

    const responsePayload = {
      ig_user_id: igData.id,
      username: igData.username || '',
      name: igData.name || null,
      biography: igData.biography || null,
      profile_picture_url: igData.profile_picture_url || null,
      followers_count: igData.followers_count ?? null,
      follows_count: igData.follows_count ?? null,
      media_count: igData.media_count ?? null,
      website: igData.website || null,
      account_type: igData.account_type || null,
      institution_id: igAccount.institution_id,
      is_active: igAccount.is_active,
      last_synced_at: now,
      db_update_error: updateError ? updateError.message : null,
    };

    await writeLog(serviceClient, {
      institution_id: igAccount.institution_id,
      endpoint: '/api/social/instagram/account-profile',
      method: 'GET',
      request_payload: { ig_user_id: igUserId },
      response_status: 200,
      response_body: { ig_user_id: igData.id, username: igData.username },
      error_message: null,
    });

    return NextResponse.json({ success: true, data: responsePayload });
  } catch (error) {
    console.error('[ig-profile] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Profile fetch failed' },
      { status: 500 }
    );
  }
}
