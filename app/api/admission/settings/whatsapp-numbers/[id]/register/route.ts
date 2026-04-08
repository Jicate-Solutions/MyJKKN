

// POST /api/admission/settings/whatsapp-numbers/[id]/register
// Register a phone number on WhatsApp Cloud API
//
// DELETE /api/admission/settings/whatsapp-numbers/[id]/register
// Deregister a phone number from WhatsApp Cloud API

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

async function getPhoneNumberId(id: string) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('wa_phone_numbers')
    .select('phone_number_id')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new Error('Phone number not found');
  }

  return data.phone_number_id;
}

// POST: Register a phone number on WhatsApp Cloud API
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

    const phoneNumberId = await getPhoneNumberId(id);

    // Accept optional pin from request body
    let pin = '123456';
    try {
      const body = await request.json();
      if (body.pin) {
        pin = body.pin;
      }
    } catch {
      // No body or invalid JSON — use default pin
    }

    // Register on WhatsApp Cloud API
    const response = await fetch(`${GRAPH_API}/${phoneNumberId}/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[whatsapp-numbers/[id]/register] Cloud API error:', result);
      return NextResponse.json(
        { error: result.error?.message || 'Failed to register phone number' },
        { status: response.status }
      );
    }

    // Update record with registration note
    const serviceClient = getServiceClient();
    await serviceClient
      .from('wa_phone_numbers')
      .update({
        notes: `Registered on WhatsApp Cloud API at ${new Date().toISOString()}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({
      success: true,
      message: 'Phone number registered successfully',
      data: result,
    });
  } catch (error) {
    console.error('[whatsapp-numbers/[id]/register] POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to register phone number' },
      { status: 500 }
    );
  }
}

// DELETE: Deregister a phone number from WhatsApp Cloud API
export async function DELETE(
  _request: NextRequest,
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

    const phoneNumberId = await getPhoneNumberId(id);

    // Deregister from WhatsApp Cloud API
    const response = await fetch(`${GRAPH_API}/${phoneNumberId}/deregister`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[whatsapp-numbers/[id]/register] Deregister Cloud API error:', result);
      return NextResponse.json(
        { error: result.error?.message || 'Failed to deregister phone number' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Phone number deregistered successfully',
      data: result,
    });
  } catch (error) {
    console.error('[whatsapp-numbers/[id]/register] DELETE Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to deregister phone number' },
      { status: 500 }
    );
  }
}
