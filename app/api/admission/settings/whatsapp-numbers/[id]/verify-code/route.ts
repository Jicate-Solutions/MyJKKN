export const dynamic = 'force-dynamic';

// POST /api/admission/settings/whatsapp-numbers/[id]/verify-code
// Verify a received verification code for a WhatsApp phone number

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

// POST: Verify the received code
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
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400 }
      );
    }

    // Verify code with WhatsApp Cloud API
    const response = await fetch(`${GRAPH_API}/${waNumber.phone_number_id}/verify_code`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[whatsapp-numbers/[id]/verify-code] Cloud API error:', result);
      return NextResponse.json(
        { error: result.error?.message || 'Failed to verify code' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Phone number verified successfully',
      data: result,
    });
  } catch (error) {
    console.error('[whatsapp-numbers/[id]/verify-code] POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify code' },
      { status: 500 }
    );
  }
}
