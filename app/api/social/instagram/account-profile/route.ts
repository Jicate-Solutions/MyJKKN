export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/account-profile
 *
 * Fetches the live profile for a single Instagram account via the Graph API
 * (lib/instagram/api-client.ts), then refreshes the ig_accounts row.
 *
 * Query params:
 *   ig_user_id: string        — required; the IG Professional account ID
 *   institution_id?: string   — required for institution_admin auth check
 *
 * Auth: super_admin OR institution_admin whose institution owns the ig_account.
 *
 * 2026-06-10 fix: replaced the "Agent α stub"-era inline fetch (v21.0 +
 * non-existent INSTAGRAM_ACCESS_TOKEN env var) with the real client and the
 * proven token chain (per-account access_token → META_IG_SYSTEM_USER_TOKEN →
 * MESSENGER_PAGE_ACCESS_TOKEN → META_PAGE_ACCESS_TOKEN). The ig_accounts
 * UPDATE now writes only columns that exist (username, account_type,
 * last_polled_at); display fields (name, biography, counts, …) are returned
 * live in the response without persistence — response keys are unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAccountProfile } from '@/lib/instagram/api-client';
import type { IgAccountProfile } from '@/lib/instagram/types';
import { MetaGraphError } from '@/lib/meta/types';

const GRAPH_API_VERSION = 'v25.0';

const IG_ACCOUNT_TYPES = ['BUSINESS', 'CREATOR', 'PERSONAL'] as const;

async function writeLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    account_id: string | null;
    event_type: string;
    payload: Record<string, unknown>;
    status: 'success' | 'error';
    error_message: string | null;
  }
) {
  try {
    await supabase.from('social_instagram_logs').insert({
      account_id: params.account_id,
      event_type: params.event_type,
      payload: params.payload,
      status: params.status,
      error_message: params.error_message,
      occurred_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.warn('[ig-profile] Log write failed:', err);
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

    // 2026-06-11 granular-permission retrofit: roles granted
    // social.instagram.view via Role Management pass too; the ownership
    // check against the ig_account's institution below still applies.
    let hasViewPerm = false;
    if (!isSuperAdmin && !isInstitutionAdmin) {
      const { data: perm } = await supabase.rpc('user_has_permission', {
        permission_name: 'social.instagram.view',
      });
      hasViewPerm = !!perm;
    }

    if (!isSuperAdmin && !isInstitutionAdmin && !hasViewPerm) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const serviceClient = createServiceRoleClient();

    // Fetch the ig_accounts row to verify ownership and get institution context
    const { data: igAccount, error: accountError } = await serviceClient
      .from('ig_accounts')
      .select('id, ig_user_id, username, institution_id, status, access_token')
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

    // Token chain: per-account token first, then the proven env fallbacks
    // (same chain as the IG metrics poller / drift-check crons).
    const accessToken =
      igAccount.access_token ||
      process.env.META_IG_SYSTEM_USER_TOKEN ||
      process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
      process.env.META_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Instagram access token not configured (META_IG_SYSTEM_USER_TOKEN / MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN)',
        },
        { status: 503 }
      );
    }

    // Fetch live profile from Graph API via the real client
    let igData: IgAccountProfile;
    try {
      igData = await getAccountProfile(igUserId, {
        accessToken,
        apiVersion: GRAPH_API_VERSION,
      });
    } catch (graphError) {
      const isMetaError = graphError instanceof MetaGraphError;
      const message = graphError instanceof Error ? graphError.message : 'Unknown Graph API error';
      const httpStatus = isMetaError && graphError.status >= 400 ? graphError.status : 502;

      await writeLog(serviceClient, {
        account_id: igAccount.id,
        event_type: 'account_profile',
        payload: {
          ig_user_id: igUserId,
          meta_error: isMetaError ? (graphError.payload ?? { message }) : { message },
        },
        status: 'error',
        error_message: message,
      });

      return NextResponse.json(
        { success: false, error: `Meta API error: ${message}` },
        { status: httpStatus }
      );
    }

    // Update ig_accounts with fresh data — only columns that exist on the
    // table (see migrations 20260530140000 + 20260609000726).
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      username: igData.username || igAccount.username,
      last_polled_at: now,
      updated_at: now,
    };
    // account_type is NOT NULL with a CHECK constraint — only write valid values.
    if (
      igData.account_type &&
      (IG_ACCOUNT_TYPES as readonly string[]).includes(igData.account_type)
    ) {
      updatePayload.account_type = igData.account_type;
    }

    const { error: updateError } = await serviceClient
      .from('ig_accounts')
      .update(updatePayload)
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
      is_active: igAccount.status === 'active',
      last_synced_at: now,
      db_update_error: updateError ? updateError.message : null,
    };

    await writeLog(serviceClient, {
      account_id: igAccount.id,
      event_type: 'account_profile',
      payload: { ig_user_id: igData.id, username: igData.username },
      status: 'success',
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
