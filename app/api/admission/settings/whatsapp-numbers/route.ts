// GET/POST /api/admission/settings/whatsapp-numbers
// Manage WABA phone numbers per institution

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET: List all WABA numbers for user's institution
export async function GET(request: NextRequest) {
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
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (profile?.institution_id !== institutionId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const serviceClient = getServiceClient();
    const { data, error } = await serviceClient
      .from('wa_phone_numbers')
      .select('*')
      .eq('institution_id', institutionId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch WABA numbers: ${error.message}`);

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('[settings/whatsapp-numbers] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Add a new WABA phone number
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      return NextResponse.json({ error: 'No institution assigned' }, { status: 403 });
    }

    const body = await request.json();
    const { phone_number_id, business_account_id, display_number, access_token } = body;

    if (!phone_number_id || !business_account_id || !display_number) {
      return NextResponse.json(
        { error: 'phone_number_id, business_account_id, and display_number are required' },
        { status: 400 }
      );
    }

    // Use the institution_id from the user's profile, not from the request body
    const institutionId = profile.institution_id;

    // If body included institution_id, verify it matches
    if (body.institution_id && body.institution_id !== institutionId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const serviceClient = getServiceClient();

    // Check if phone_number_id already exists (unique constraint)
    const { data: existing } = await serviceClient
      .from('wa_phone_numbers')
      .select('id')
      .eq('phone_number_id', phone_number_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This phone number ID is already registered' },
        { status: 409 }
      );
    }

    // Check if this is the first number for the institution (make it primary automatically)
    const { count } = await serviceClient
      .from('wa_phone_numbers')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId);

    const isFirst = (count || 0) === 0;

    const { data, error } = await serviceClient
      .from('wa_phone_numbers')
      .insert({
        institution_id: institutionId,
        phone_number_id,
        business_account_id,
        display_number,
        access_token_encrypted: access_token || null,
        is_primary: isFirst,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add WABA number: ${error.message}`);

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[settings/whatsapp-numbers] POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add number' },
      { status: 500 }
    );
  }
}
