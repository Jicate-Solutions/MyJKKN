export const dynamic = 'force-dynamic';

// GET/DELETE /api/admission/settings/whatsapp-templates/[id]
// Get single template details or delete a template from Meta

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

// GET: Get single template details from Meta
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'WhatsApp access token not configured' },
        { status: 500 }
      );
    }

    const { id: templateId } = await params;

    const response = await fetch(
      `${GRAPH_API}/${templateId}?fields=name,status,language,category,components,quality_score`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const metaError =
        errorData?.error?.message || `Meta API error: ${response.status}`;
      console.error('[whatsapp-templates] Meta API get error:', errorData);
      return NextResponse.json({ error: metaError }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[settings/whatsapp-templates/[id]] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

// DELETE: Delete template from Meta (Meta deletes by NAME, not ID)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: templateId } = await params;

    // First, fetch the template to get its name (Meta deletes by name)
    const fetchResponse = await fetch(
      `${GRAPH_API}/${templateId}?fields=name`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!fetchResponse.ok) {
      const errorData = await fetchResponse.json().catch(() => ({}));
      const metaError =
        errorData?.error?.message || `Meta API error: ${fetchResponse.status}`;
      console.error('[whatsapp-templates] Failed to fetch template for deletion:', errorData);
      return NextResponse.json({ error: metaError }, { status: fetchResponse.status });
    }

    const templateData = await fetchResponse.json();
    const templateName = templateData.name;

    if (!templateName) {
      return NextResponse.json(
        { error: 'Could not resolve template name from ID' },
        { status: 404 }
      );
    }

    // Delete by name via Meta API
    const deleteResponse = await fetch(
      `${GRAPH_API}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json().catch(() => ({}));
      const metaError =
        errorData?.error?.message || `Meta API error: ${deleteResponse.status}`;
      console.error('[whatsapp-templates] Meta API delete error:', errorData);
      return NextResponse.json({ error: metaError }, { status: deleteResponse.status });
    }

    const data = await deleteResponse.json();
    return NextResponse.json({ data, deleted_template_name: templateName });
  } catch (error) {
    console.error('[settings/whatsapp-templates/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete template' },
      { status: 500 }
    );
  }
}
