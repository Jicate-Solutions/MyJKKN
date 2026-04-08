

// POST /api/admission/settings/whatsapp-numbers/[id]/request-code
// Request a verification code for a WhatsApp phone number via SMS or VOICE

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// POST: Request verification code
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'WhatsApp access token not configured' },
        { status: 500 }
      );
    }

    // Verify auth
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get phone_number_id from DB
    const serviceClient = getServiceClient();
    const { data: waNumber, error: fetchError } = await serviceClient
      .from('wa_phone_numbers')
      .select('phone_number_id')
      .eq('id', id)
      .single();

    if (fetchError || !waNumber) {
      return NextResponse.json({ error: 'Phone number not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const code_method = body.code_method || 'SMS';
    const language = body.language || 'en';

    if (!['SMS', 'VOICE'].includes(code_method)) {
      return NextResponse.json(
        { error: 'code_method must be "SMS" or "VOICE"' },
        { status: 400 }
      );
    }

    // Request verification code from WhatsApp Cloud API
    const response = await fetch(`${GRAPH_API}/${waNumber.phone_number_id}/request_code`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code_method,
        language,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[whatsapp-numbers/[id]/request-code] Cloud API error:', result);
      return NextResponse.json(
        { error: result.error?.message || 'Failed to request verification code' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Verification code sent via ${code_method}`,
      data: result,
    });
  } catch (error) {
    console.error('[whatsapp-numbers/[id]/request-code] POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to request verification code' },
      { status: 500 }
    );
  }
}
