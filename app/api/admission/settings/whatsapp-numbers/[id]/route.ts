// PUT/DELETE /api/admission/settings/whatsapp-numbers/[id]
// Update or delete a specific WABA phone number

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

// Helper: verify user owns the WABA number via institution_id
async function verifyOwnership(supabase: any, userId: string, numberId: string) {
  // Get user's institution
  const { data: profile } = await supabase
    .from('profiles')
    .select('institution_id')
    .eq('id', userId)
    .single();

  if (!profile?.institution_id) {
    return { authorized: false, institutionId: null, error: 'No institution assigned' };
  }

  // Get the WABA number and check institution match
  const serviceClient = getServiceClient();
  const { data: waNumber, error } = await serviceClient
    .from('wa_phone_numbers')
    .select('*')
    .eq('id', numberId)
    .single();

  if (error || !waNumber) {
    return { authorized: false, institutionId: profile.institution_id, error: 'Number not found' };
  }

  if (waNumber.institution_id !== profile.institution_id) {
    return { authorized: false, institutionId: profile.institution_id, error: 'Access denied' };
  }

  return { authorized: true, institutionId: profile.institution_id, waNumber, error: null };
}

// PUT: Update a WABA phone number
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ownership = await verifyOwnership(supabase, user.id, id);
    if (!ownership.authorized) {
      const status = ownership.error === 'Number not found' ? 404 : 403;
      return NextResponse.json({ error: ownership.error }, { status });
    }

    const body = await request.json();
    const allowedFields = [
      'display_number',
      'verified_name',
      'quality_rating',
      'messaging_limit',
      'is_active',
      'access_token_encrypted',
    ];

    // Build update object with only allowed fields
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Handle access_token alias (frontend sends access_token, DB column is access_token_encrypted)
    if (body.access_token !== undefined && body.access_token_encrypted === undefined) {
      updateData.access_token_encrypted = body.access_token || null;
    }

    const serviceClient = getServiceClient();
    const { data, error } = await serviceClient
      .from('wa_phone_numbers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update WABA number: ${error.message}`);

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[settings/whatsapp-numbers/[id]] PUT Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update number' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a WABA phone number
export async function DELETE(
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

    const ownership = await verifyOwnership(supabase, user.id, id);
    if (!ownership.authorized) {
      const status = ownership.error === 'Number not found' ? 404 : 403;
      return NextResponse.json({ error: ownership.error }, { status });
    }

    const serviceClient = getServiceClient();

    // If deleting the primary number, promote another one
    if (ownership.waNumber?.is_primary) {
      const { data: others } = await serviceClient
        .from('wa_phone_numbers')
        .select('id')
        .eq('institution_id', ownership.institutionId)
        .neq('id', id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1);

      if (others && others.length > 0) {
        await serviceClient
          .from('wa_phone_numbers')
          .update({ is_primary: true, updated_at: new Date().toISOString() })
          .eq('id', others[0].id);
      }
    }

    const { error } = await serviceClient
      .from('wa_phone_numbers')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete WABA number: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[settings/whatsapp-numbers/[id]] DELETE Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete number' },
      { status: 500 }
    );
  }
}
