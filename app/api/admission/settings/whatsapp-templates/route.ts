

// GET/POST /api/admission/settings/whatsapp-templates
// List all templates from Meta API (live) and create new templates

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

// GET: List all templates from Meta API (live, not from DB)
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!wabaId || !accessToken) {
      return NextResponse.json(
        { error: 'WhatsApp Business Account not configured' },
        { status: 500 }
      );
    }

    // Fetch all templates with pagination
    const allTemplates: Record<string, unknown>[] = [];
    let url: string | null =
      `${GRAPH_API}/${wabaId}/message_templates?fields=name,status,language,category,components,quality_score&limit=100`;

    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const metaError =
          errorData?.error?.message || `Meta API error: ${response.status}`;
        console.error('[whatsapp-templates] Meta API error:', errorData);
        return NextResponse.json({ error: metaError }, { status: response.status });
      }

      const data = await response.json();
      if (data.data) {
        allTemplates.push(...data.data);
      }

      // Follow pagination if more results exist
      url = data.paging?.next || null;
    }

    return NextResponse.json({ data: allTemplates });
  } catch (error) {
    console.error('[settings/whatsapp-templates] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST: Create a new template on Meta
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!wabaId || !accessToken) {
      return NextResponse.json(
        { error: 'WhatsApp Business Account not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { name, language, category, components } = body;

    if (!name || !language || !category || !components) {
      return NextResponse.json(
        { error: 'name, language, category, and components are required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${GRAPH_API}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, language, category, components }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const metaError =
        errorData?.error?.message || `Meta API error: ${response.status}`;
      console.error('[whatsapp-templates] Meta API create error:', errorData);
      return NextResponse.json({ error: metaError }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[settings/whatsapp-templates] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 500 }
    );
  }
}
