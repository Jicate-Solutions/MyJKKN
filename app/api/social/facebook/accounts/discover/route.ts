export const dynamic = 'force-dynamic';

/**
 * GET /api/social/facebook/accounts/discover
 *
 * Enumerates all Facebook Pages accessible under the configured Meta Business
 * Manager token. Returns each Page with a flag indicating whether it is
 * already synced into fb_pages.
 *
 * Auth: super_admin OR institution_admin scoped to requested institution_id.
 *
 * Uses lib/facebook/api-client.discoverPages → owned_pages endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { discoverPages } from '@/lib/facebook/api-client';
import type { FbPageSummary } from '@/lib/facebook/types';

interface DiscoveredFbPage extends FbPageSummary {
  already_synced: boolean;
}

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
      console.warn('[fb-discover] Log write failed:', err);
    });
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
    // social.facebook.manage via Role Management pass too, under the same
    // institution-match constraint as institution_admin.
    let hasManagePerm = false;
    if (
      !isSuperAdmin &&
      !isInstitutionAdmin &&
      (!institutionId || profile?.institution_id === institutionId)
    ) {
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
    const start = Date.now();

    // Step 1: discover via owned_pages
    let pages: FbPageSummary[] = [];
    try {
      pages = await discoverPages(businessId, { accessToken });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Discovery failed';
      await writeLog(serviceClient, {
        page_id: null,
        event_type: 'discover',
        status: 'error',
        payload: { institution_id: institutionId, business_id: businessId },
        error_message: msg,
      });
      console.error('[fb-discover] discoverPages failed:', err);
      return NextResponse.json({ success: false, error: msg }, { status: 502 });
    }

    // Step 2: Check which pages are already synced in fb_pages
    const discovered: DiscoveredFbPage[] = pages.map((p) => ({
      ...p,
      already_synced: false,
    }));

    if (discovered.length > 0) {
      let existingQuery = serviceClient.from('fb_pages').select('fb_page_id');
      if (institutionId) {
        existingQuery = existingQuery.eq('institution_id', institutionId);
      }
      const { data: existing } = await existingQuery;
      const existingIds = new Set(
        (existing || []).map((e: { fb_page_id: string }) => e.fb_page_id)
      );
      for (const pg of discovered) {
        pg.already_synced = existingIds.has(pg.id);
      }
    }

    const responsePayload = {
      discovered: discovered.map((d) => ({
        // Strip per-page access_token from the response — admin UI doesn't need it.
        id: d.id,
        name: d.name,
        category: d.category,
        already_synced: d.already_synced,
      })),
      total: discovered.length,
      already_synced: discovered.filter((d) => d.already_synced).length,
      available: discovered.filter((d) => !d.already_synced).length,
    };

    await writeLog(serviceClient, {
      page_id: null,
      event_type: 'discover',
      status: 'success',
      payload: {
        institution_id: institutionId,
        total: responsePayload.total,
        duration_ms: Date.now() - start,
      },
      error_message: null,
    });

    console.info(
      `[fb-discover] ${discovered.length} pages found in ${Date.now() - start}ms`
    );

    return NextResponse.json({ success: true, data: responsePayload });
  } catch (error) {
    console.error('[fb-discover] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Discovery failed',
      },
      { status: 500 }
    );
  }
}
