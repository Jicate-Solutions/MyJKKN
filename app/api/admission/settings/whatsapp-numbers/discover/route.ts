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

    // 2. Get all WABAs the token has access to via the business
    // First try listing WABAs from the app's subscriptions
    const wabasRes = await fetch(
      `${GRAPH_API}/${appId}/subscriptions?access_token=${accessToken}`
    );
    const wabasData = await wabasRes.json();

    // 3. Get WABAs from the business portfolio
    // The token's granular_scopes tell us which WABAs we can access
    const granularScopes = debugData.data?.granular_scopes || [];
    const wabaScope = granularScopes.find(
      (s: { scope: string; target_ids?: string[] }) => s.scope === 'whatsapp_business_management'
    );

    let wabaIds: string[] = [];

    if (wabaScope?.target_ids?.length) {
      wabaIds = wabaScope.target_ids;
    } else {
      // Fallback: use known WABA IDs from env or try business discovery
      const businessId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
      if (businessId) {
        wabaIds = [businessId];
      }

      // Also try the app's whatsapp_business_account subscriptions
      // to discover additional WABAs
      const appToken = `${appId}|${process.env.WHATSAPP_WEBHOOK_SECRET || ''}`;
      try {
        const subsRes = await fetch(
          `${GRAPH_API}/${appId}/subscriptions?access_token=${appToken}`
        );
        const subsData = await subsRes.json();
        if (subsData.data) {
          // subscriptions exist but don't directly list WABA IDs
          // We'll rely on the known WABA IDs
        }
      } catch {
        // Non-critical
      }
    }

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
