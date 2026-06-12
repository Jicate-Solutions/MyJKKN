export const dynamic = 'force-dynamic';

/**
 * POST /api/social/facebook/accounts/sync
 *
 * Syncs discovered Facebook Pages into the fb_pages table. Upserts on
 * fb_page_id — safe to call repeatedly (idempotent).
 *
 * Body:
 *   institution_id: string   — institution to associate pages with
 *   fb_page_ids?:   string[] — optional: only sync these specific Page IDs
 *                              (omit to sync all discovered Pages)
 *
 * Auth: super_admin OR institution_admin scoped to institution_id in body.
 *
 * Uses lib/facebook/api-client.discoverPages → owned_pages endpoint, then
 * getPageProfile for the full record per Page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { discoverPages, getPageProfile } from '@/lib/facebook/api-client';
import type { FbPageSummary } from '@/lib/facebook/types';

async function writeLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    page_id: string | null;
    event_type: string;
    status: 'success' | 'error';
    payload: Record<string, unknown>;
    error_message: string | null;
  }
) {
  await supabase
    .from('social_facebook_logs')
    .insert({
      page_id: params.page_id,
      event_type: params.event_type,
      status: params.status,
      payload: params.payload,
      error_message: params.error_message,
    })
    .then(() => {})
    .catch((err: unknown) => {
      console.warn('[fb-sync] Log write failed:', err);
    });
}

interface SyncResult {
  fb_page_id: string;
  name: string;
  status: 'upserted' | 'error';
  error?: string;
}

export async function POST(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      institution_id?: string;
      fb_page_ids?: string[];
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

    // 2026-06-11 granular-permission retrofit: roles granted
    // social.facebook.manage via Role Management pass too, restricted to
    // their own institution like institution_admin.
    let hasManagePerm = false;
    if (!isSuperAdmin && !isInstitutionAdmin && profile?.institution_id === institutionId) {
      const { data: perm } = await supabase.rpc('user_has_permission', {
        permission_name: 'social.facebook.manage',
      });
      hasManagePerm = !!perm;
    }

    if (!isSuperAdmin && !isInstitutionAdmin && !hasManagePerm) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'FACEBOOK_ACCESS_TOKEN not configured' },
        { status: 503 }
      );
    }

    const businessId = process.env.META_BUSINESS_MANAGER_ID;
    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'META_BUSINESS_MANAGER_ID not configured' },
        { status: 503 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Step 1: enumerate all owned Pages so we can pick the per-page tokens
    let allPages: FbPageSummary[] = [];
    try {
      allPages = await discoverPages(businessId, { accessToken });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Discovery failed';
      await writeLog(serviceClient, {
        page_id: null,
        event_type: 'sync',
        status: 'error',
        payload: { institution_id: institutionId, business_id: businessId },
        error_message: msg,
      });
      return NextResponse.json({ success: false, error: msg }, { status: 502 });
    }

    // Step 2: pick the subset to sync
    const requestedIds = body.fb_page_ids;
    const toSync = requestedIds && requestedIds.length > 0
      ? allPages.filter((p) => requestedIds.includes(p.id))
      : allPages;

    if (toSync.length === 0) {
      return NextResponse.json({
        success: true,
        data: { synced: 0, failed: 0, total: 0, results: [] },
      });
    }

    const results: SyncResult[] = [];
    let synced = 0;
    let failed = 0;

    // Step 3: fetch each Page's profile with its OWN access_token, upsert into fb_pages
    await Promise.all(
      toSync.map(async (summary) => {
        const pageToken = summary.access_token || accessToken; // fall back to system token
        try {
          const fullProfile = await getPageProfile(summary.id, { accessToken: pageToken });

          const now = new Date().toISOString();
          const { error: upsertError } = await serviceClient
            .from('fb_pages')
            .upsert(
              {
                institution_id: institutionId,
                fb_page_id: fullProfile.id,
                name: fullProfile.name || summary.name || '',
                username: fullProfile.username || null,
                category: fullProfile.category || summary.category || null,
                link: fullProfile.link || null,
                picture_url: fullProfile.picture?.data?.url || null,
                fan_count: fullProfile.fan_count ?? null,
                followers_count: fullProfile.followers_count ?? null,
                access_token: summary.access_token || null,
                status: 'active',
                last_polled_at: now,
                updated_at: now,
              },
              { onConflict: 'fb_page_id', ignoreDuplicates: false }
            );

          if (upsertError) {
            results.push({
              fb_page_id: summary.id,
              name: summary.name || '',
              status: 'error',
              error: upsertError.message,
            });
            failed++;
            return;
          }

          results.push({
            fb_page_id: summary.id,
            name: fullProfile.name || summary.name || '',
            status: 'upserted',
          });
          synced++;
        } catch (err) {
          results.push({
            fb_page_id: summary.id,
            name: summary.name || '',
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
      total: toSync.length,
      results,
    };

    await writeLog(serviceClient, {
      page_id: null,
      event_type: 'sync',
      status: failed > 0 ? 'error' : 'success',
      payload: {
        institution_id: institutionId,
        synced,
        failed,
        total: toSync.length,
      },
      error_message: failed > 0 ? `${failed} page(s) failed to sync` : null,
    });

    console.info(`[fb-sync] synced=${synced} failed=${failed} total=${toSync.length}`);

    return NextResponse.json({ success: true, data: responsePayload });
  } catch (error) {
    console.error('[fb-sync] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      },
      { status: 500 }
    );
  }
}
