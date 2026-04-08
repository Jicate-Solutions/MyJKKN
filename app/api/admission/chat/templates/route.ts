export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import axios from 'axios';

// GET /api/admission/chat/templates — fetch approved templates from Meta Graph API
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

    // Allow filtering by specific WABA (for multi-number sender selection)
    const { searchParams } = new URL(request.url);
    const businessAccountId = searchParams.get('business_account_id') || defaultWabaId;

    const { data: metaResponse } = await axios.get(
      `https://graph.facebook.com/v21.0/${businessAccountId}/message_templates`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: 250, fields: 'name,status,category,language,components' },
      }
    );

    const templates = (metaResponse.data || [])
      .filter((t: { status: string }) => t.status === 'APPROVED')
      .map((t: { id?: string; name: string; category: string; language: string; status: string; components?: { type: string; text?: string; format?: string }[] }) => ({
        id: t.id || t.name,
        name: t.name,
        category: t.category,
        language: t.language,
        status: t.status,
        components: t.components || [],
      }));

    return NextResponse.json({ data: templates, business_account_id: businessAccountId });
  } catch (error) {
    console.error('[chat/templates] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
