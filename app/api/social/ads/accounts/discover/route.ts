export const dynamic = 'force-dynamic';

/**
 * GET /api/social/ads/accounts/discover
 *
 * Enumerates all Meta Ad Accounts accessible under the configured Business
 * Manager token. Returns each account with a flag indicating whether it is
 * already mirrored into `meta_ad_accounts` for the requested institution.
 *
 * Auth: super_admin OR institution_admin scoped to the requested institution_id.
 *
 * READ-ONLY surface — no writes flow back to Meta. This route only reads
 * from the Graph API and queries the local mirror table for the
 * `already_synced` flag; it does NOT create ad accounts on either side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { listAdAccounts } from '@/lib/meta/ads-client';
import type { FbAdAccount } from '@/lib/meta/ads-types';

interface DiscoveredAdAccount extends FbAdAccount {
  already_synced: boolean;
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

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
    // social.ads.manage via Role Management pass too, under the same
    // institution-match constraint as institution_admin.
    let hasManagePerm = false;
    if (
      !isSuperAdmin &&
      !isInstitutionAdmin &&
      (!institutionId || profile?.institution_id === institutionId)
    ) {
      const { data: perm } = await supabase.rpc('user_has_permission', {
        permission_name: 'social.ads.manage',
      });
      hasManagePerm = !!perm;
    }

    if (!isSuperAdmin && !isInstitutionAdmin && !hasManagePerm) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const accessToken =
      process.env.META_ADS_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'META_ADS_ACCESS_TOKEN not configured' },
        { status: 503 }
      );
    }

    // Resolve Business Manager IDs. Prefer the explicit env var; fall back
    // to the IG businesses-from-/me method already used by the IG discover
    // route, since both surfaces share the JKKN business manager.
    const businessIdSet = new Set<string>();
    const envBusinessId = process.env.META_BUSINESS_MANAGER_ID;
    if (envBusinessId) businessIdSet.add(envBusinessId);

    const businessIds = Array.from(businessIdSet);
    if (businessIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'META_BUSINESS_MANAGER_ID not configured — set it in env or wire IG discover fallback.',
        },
        { status: 503 }
      );
    }

    const logStart = Date.now();
    const discovered: DiscoveredAdAccount[] = [];

    for (const bizId of businessIds) {
      try {
        const accounts = await listAdAccounts(bizId, { accessToken });
        for (const acct of accounts) {
          discovered.push({ ...acct, already_synced: false });
        }
      } catch (err) {
        console.warn(
          `[meta-ads-discover] Failed to enumerate ad accounts for business ${bizId}:`,
          err
        );
      }
    }

    // Mark already-synced for the requested institution (if any).
    if (discovered.length > 0) {
      const serviceClient = createServiceRoleClient();
      let existingQuery = serviceClient
        .from('meta_ad_accounts')
        .select('fb_ad_account_id');
      if (institutionId) {
        existingQuery = existingQuery.eq('institution_id', institutionId);
      }
      const { data: existing } = await existingQuery;
      const existingIds = new Set(
        (existing || []).map(
          (e: { fb_ad_account_id: string }) => e.fb_ad_account_id
        )
      );
      for (const acct of discovered) {
        acct.already_synced = existingIds.has(acct.id);
      }
    }

    const payload = {
      discovered,
      total: discovered.length,
      already_synced: discovered.filter((d) => d.already_synced).length,
      available: discovered.filter((d) => !d.already_synced).length,
      business_count: businessIds.length,
    };

    console.info(
      `[meta-ads-discover] ${discovered.length} accounts in ${Date.now() - logStart}ms`
    );

    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    console.error('[meta-ads-discover] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Discovery failed',
      },
      { status: 500 }
    );
  }
}
