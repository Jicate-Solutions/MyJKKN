// POST /api/admission/settings/whatsapp-numbers/[id]/primary
// Set a WABA phone number as the primary number for the institution

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

// POST: Set a specific number as primary
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's institution
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      return NextResponse.json({ error: 'No institution assigned' }, { status: 403 });
    }

    const serviceClient = getServiceClient();

    // Verify the target number belongs to the user's institution
    const { data: targetNumber, error: fetchError } = await serviceClient
      .from('wa_phone_numbers')
      .select('id, institution_id, is_active')
      .eq('id', id)
      .single();

    if (fetchError || !targetNumber) {
      return NextResponse.json({ error: 'Number not found' }, { status: 404 });
    }

    if (targetNumber.institution_id !== profile.institution_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!targetNumber.is_active) {
      return NextResponse.json(
        { error: 'Cannot set an inactive number as primary' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Unset current primary number(s) for this institution
    await serviceClient
      .from('wa_phone_numbers')
      .update({ is_primary: false, updated_at: now })
      .eq('institution_id', profile.institution_id)
      .eq('is_primary', true);

    // Set the target number as primary
    const { data, error } = await serviceClient
      .from('wa_phone_numbers')
      .update({ is_primary: true, updated_at: now })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to set primary number: ${error.message}`);

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[settings/whatsapp-numbers/[id]/primary] POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set primary number' },
      { status: 500 }
    );
  }
}
