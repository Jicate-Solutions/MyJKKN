export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Meta Graph API base
const GRAPH_API = 'https://graph.facebook.com/v21.0';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface MetaPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  platform_type: string;
  code_verification_status: string;
  status?: string;
  throughput?: { level: string };
}

interface DiscoveredNumber {
  phone_number_id: string;
  display_number: string;
  verified_name: string;
  quality_rating: string;
  platform_type: string;
  verification_status: string;
  status: string;
  messaging_limit: string;
  waba_id: string;
  waba_name: string;
  already_added: boolean;
}

/**
 * GET /api/admission/settings/whatsapp-numbers/discover
 *
 * Discovers all phone numbers across all WABAs accessible to the
 * configured Meta access token. Returns them with flags showing
 * which are already added to MyJKKN.
 */
export async function GET(request: NextRequest) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: 'WHATSAPP_ACCESS_TOKEN not configured' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const institutionId = searchParams.get('institution_id');

  try {
    // 1. Get the app ID from token debug
    const debugRes = await fetch(
      `${GRAPH_API}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
    );
    const debugData = await debugRes.json();
    const appId = debugData.data?.app_id;

    if (!appId) {
      return NextResponse.json(
        { error: 'Could not determine app ID from access token' },
        { status: 400 }
      );
    }

    // 2. Discover ALL WABAs from the business portfolio
    // Try multiple methods to find every WABA
    const wabaIdSet = new Set<string>();

    // Method A: Query the business portfolio for owned WABAs
    // The business_id comes from the token's profile
    const profileRes = await fetch(
      `${GRAPH_API}/me?fields=id,name&access_token=${accessToken}`
    );
    const profileData = await profileRes.json();
    const systemUserId = profileData.id;

    if (systemUserId) {
      // System user → get assigned WABAs
      try {
        const assignedRes = await fetch(
          `${GRAPH_API}/${systemUserId}/assigned_whatsapp_business_accounts?access_token=${accessToken}`
        );
        const assignedData = await assignedRes.json();
        for (const waba of assignedData.data || []) {
          wabaIdSet.add(waba.id);
        }
      } catch {
        // Not all tokens support this endpoint
      }
    }

    // Method B: Check granular_scopes for explicitly listed WABAs
    const granularScopes = debugData.data?.granular_scopes || [];
    const wabaScope = granularScopes.find(
      (s: { scope: string; target_ids?: string[] }) => s.scope === 'whatsapp_business_management'
    );
    if (wabaScope?.target_ids?.length) {
      for (const id of wabaScope.target_ids) {
        wabaIdSet.add(id);
      }
    }

    // Method C: Use the known WABA ID from env var
    const envWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (envWabaId) {
      wabaIdSet.add(envWabaId);
    }

    // Method D: Query the business portfolio for ALL owned WABAs
    // Try app→business first, then fall back to known business ID
    const businessIds = new Set<string>();
    try {
      const appRes = await fetch(
        `${GRAPH_API}/${appId}?fields=business&access_token=${accessToken}`
      );
      const appData = await appRes.json();
      if (appData.business?.id) businessIds.add(appData.business.id);
    } catch {
      // May fail with some token types
    }

    // Known JKKN business ID (from Meta Business Manager)
    businessIds.add('1720903384834051');

    for (const businessId of businessIds) {
      try {
        const ownedRes = await fetch(
          `${GRAPH_API}/${businessId}/owned_whatsapp_business_accounts?access_token=${accessToken}`
        );
        const ownedData = await ownedRes.json();
        for (const waba of ownedData.data || []) {
          wabaIdSet.add(waba.id);
        }
      } catch {
        // Non-critical
      }
    }

    // Method E: Check wa_phone_numbers table for any other WABA IDs already stored
    try {
      const supabase = getServiceClient();
      const { data: existingNumbers } = await supabase
        .from('wa_phone_numbers')
        .select('business_account_id')
        .not('business_account_id', 'is', null);
      for (const num of existingNumbers || []) {
        if (num.business_account_id) wabaIdSet.add(num.business_account_id);
      }
    } catch {
      // Non-critical
    }

    const wabaIds = Array.from(wabaIdSet);

    // 4. For each WABA, fetch phone numbers
    const discovered: DiscoveredNumber[] = [];

    for (const wabaId of wabaIds) {
      try {
        // Get WABA details
        let wabaName = `WABA ${wabaId}`;
        try {
          const wabaRes = await fetch(
            `${GRAPH_API}/${wabaId}?fields=name&access_token=${accessToken}`
          );
          const wabaInfo = await wabaRes.json();
          if (wabaInfo.name) wabaName = wabaInfo.name;
        } catch {
          // Use default name
        }

        // Get phone numbers
        const phonesRes = await fetch(
          `${GRAPH_API}/${wabaId}/phone_numbers?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,status,throughput&access_token=${accessToken}`
        );
        const phonesData = await phonesRes.json();

        if (phonesData.data) {
          for (const phone of phonesData.data as MetaPhoneNumber[]) {
            discovered.push({
              phone_number_id: phone.id,
              display_number: phone.display_phone_number,
              verified_name: phone.verified_name || 'Unknown',
              quality_rating: phone.quality_rating || 'UNKNOWN',
              platform_type: phone.platform_type || 'NOT_APPLICABLE',
              verification_status: phone.code_verification_status || 'UNKNOWN',
              status: phone.status || 'UNKNOWN',
              messaging_limit: phone.throughput?.level || 'NOT_APPLICABLE',
              waba_id: wabaId,
              waba_name: wabaName,
              already_added: false,
            });
          }
        }
      } catch (err) {
        console.warn(`[whatsapp-discover] Failed to fetch WABA ${wabaId}:`, err);
      }
    }

    // 5. Check which numbers are already in our database
    if (institutionId) {
      const supabase = getServiceClient();
      const { data: existing } = await supabase
        .from('wa_phone_numbers')
        .select('phone_number_id')
        .eq('institution_id', institutionId);

      const existingIds = new Set((existing || []).map((e) => e.phone_number_id));

      for (const num of discovered) {
        num.already_added = existingIds.has(num.phone_number_id);
      }
    }

    return NextResponse.json({
      discovered,
      total: discovered.length,
      already_added: discovered.filter((d) => d.already_added).length,
      available: discovered.filter((d) => !d.already_added).length,
      waba_count: wabaIds.length,
    });
  } catch (error) {
    console.error('[whatsapp-discover] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Discovery failed' },
      { status: 500 }
    );
  }
}
