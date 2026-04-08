export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET /api/admission/chat/templates — fetch approved templates from ALL WABAs
// Each template is tagged with its WABA + eligible sender phone numbers
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const defaultWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    if (!accessToken || !defaultWabaId) {
      return NextResponse.json({ error: 'Meta API not configured' }, { status: 500 });
    }

    // Allow filtering by specific WABA
    const { searchParams } = new URL(request.url);
    const singleWabaId = searchParams.get('business_account_id');

    // Get the user's institution for looking up phone numbers
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    // Get all active phone numbers for this institution (with their WABAs)
    const serviceClient = getServiceClient();
    const { data: phoneNumbers } = await serviceClient
      .from('wa_phone_numbers')
      .select('phone_number_id, business_account_id, display_number, verified_name, is_primary')
      .eq('institution_id', profile?.institution_id || '')
      .eq('is_active', true)
      .order('is_primary', { ascending: false });

    // Get unique WABA IDs to fetch templates from
    const wabaIds = singleWabaId
      ? [singleWabaId]
      : [...new Set((phoneNumbers || []).map(p => p.business_account_id))];

    // If no phone numbers found, fall back to default WABA
    if (wabaIds.length === 0) wabaIds.push(defaultWabaId);

    // Build phone number lookup by WABA
    const phonesByWaba: Record<string, { phone_number_id: string; display_number: string; verified_name: string; is_primary: boolean }[]> = {};
    for (const p of phoneNumbers || []) {
      if (!phonesByWaba[p.business_account_id]) phonesByWaba[p.business_account_id] = [];
      phonesByWaba[p.business_account_id].push(p);
    }

    // Fetch templates from all WABAs in parallel
    const allTemplates: {
      id: string; name: string; category: string; language: string;
      status: string; components: unknown[]; business_account_id: string;
      eligible_numbers: { phone_number_id: string; display_number: string; verified_name: string; is_primary: boolean }[];
    }[] = [];

    await Promise.all(
      wabaIds.map(async (wabaId) => {
        try {
          const { data: metaResponse } = await axios.get(
            `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              params: { limit: 250, fields: 'name,status,category,language,components' },
            }
          );

          for (const t of metaResponse.data || []) {
            if (t.status !== 'APPROVED') continue;
            allTemplates.push({
              id: t.id || t.name,
              name: t.name,
              category: t.category,
              language: t.language,
              status: t.status,
              components: t.components || [],
              business_account_id: wabaId,
              eligible_numbers: phonesByWaba[wabaId] || [],
            });
          }
        } catch (err) {
          console.warn(`[chat/templates] Failed to fetch from WABA ${wabaId}:`, err instanceof Error ? err.message : err);
        }
      })
    );

    return NextResponse.json({ data: allTemplates });
  } catch (error) {
    console.error('[chat/templates] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
