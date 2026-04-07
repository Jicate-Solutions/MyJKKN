export const dynamic = 'force-dynamic';

// GET /api/admission/settings/whatsapp-health
// Account health check — queries Meta Graph API for each registered phone number

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface PhoneHealthResult {
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  platform_type: string | null;
  code_verification_status: string | null;
  status: string | null;
  throughput: Record<string, unknown> | null;
  is_official_business_account: boolean | null;
  name_status: string | null;
  error: string | null;
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Verify institution access
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isProfileMatch = profile?.institution_id === institutionId;
    const isSuperAdmin = profile?.role === 'super_admin';

    if (!isProfileMatch && !isSuperAdmin) {
      const { data: access } = await supabase
        .from('user_institution_access')
        .select('id')
        .eq('user_id', user.id)
        .eq('institution_id', institutionId)
        .maybeSingle();

      if (!access) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Fetch all phone numbers for this institution
    const serviceClient = getServiceClient();
    const { data: phoneNumbers, error: phoneError } = await serviceClient
      .from('wa_phone_numbers')
      .select('phone_number_id, display_number, is_active')
      .eq('institution_id', institutionId);

    if (phoneError) {
      throw new Error(`Failed to fetch phone numbers: ${phoneError.message}`);
    }

    if (!phoneNumbers || phoneNumbers.length === 0) {
      return NextResponse.json({
        data: {
          phone_health: [],
          summary: {
            total: 0,
            all_green: true,
            any_warnings: false,
            any_critical: false,
          },
        },
      });
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Missing WHATSAPP_ACCESS_TOKEN configuration' },
        { status: 500 }
      );
    }

    // Query Meta Graph API for each phone number in parallel
    const fields = [
      'display_phone_number',
      'verified_name',
      'quality_rating',
      'platform_type',
      'code_verification_status',
      'status',
      'throughput',
      'is_official_business_account',
      'name_status',
    ].join(',');

    const healthResults: PhoneHealthResult[] = await Promise.all(
      phoneNumbers.map(async (phone) => {
        try {
          const response = await fetch(
            `${GRAPH_API}/${phone.phone_number_id}?fields=${fields}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return {
              phone_number_id: phone.phone_number_id,
              display_phone_number: phone.display_number,
              verified_name: null,
              quality_rating: null,
              platform_type: null,
              code_verification_status: null,
              status: null,
              throughput: null,
              is_official_business_account: null,
              name_status: null,
              error: `Meta API error ${response.status}: ${errorData?.error?.message || 'Unknown error'}`,
            };
          }

          const data = await response.json();
          return {
            phone_number_id: phone.phone_number_id,
            display_phone_number: data.display_phone_number || phone.display_number,
            verified_name: data.verified_name || null,
            quality_rating: data.quality_rating || null,
            platform_type: data.platform_type || null,
            code_verification_status: data.code_verification_status || null,
            status: data.status || null,
            throughput: data.throughput || null,
            is_official_business_account: data.is_official_business_account ?? null,
            name_status: data.name_status || null,
            error: null,
          };
        } catch (err) {
          return {
            phone_number_id: phone.phone_number_id,
            display_phone_number: phone.display_number,
            verified_name: null,
            quality_rating: null,
            platform_type: null,
            code_verification_status: null,
            status: null,
            throughput: null,
            is_official_business_account: null,
            name_status: null,
            error: err instanceof Error ? err.message : 'Failed to query Meta API',
          };
        }
      })
    );

    // Compute overall health summary
    const hasErrors = healthResults.some((r) => r.error !== null);
    const qualityRatings = healthResults
      .filter((r) => r.quality_rating !== null)
      .map((r) => r.quality_rating);
    const anyWarnings =
      hasErrors || qualityRatings.some((q) => q === 'YELLOW' || q === 'LOW');
    const anyCritical = qualityRatings.some((q) => q === 'RED') ||
      healthResults.some((r) => r.status === 'FLAGGED' || r.status === 'RESTRICTED');
    const allGreen = !anyWarnings && !anyCritical && !hasErrors;

    return NextResponse.json({
      data: {
        phone_health: healthResults,
        summary: {
          total: healthResults.length,
          all_green: allGreen,
          any_warnings: anyWarnings,
          any_critical: anyCritical,
        },
      },
    });
  } catch (error) {
    console.error('[settings/whatsapp-health] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch account health' },
      { status: 500 }
    );
  }
}
