// GET/PUT /api/admission/settings/whatsapp
// Fetch and update WhatsApp settings (including auto-assignment config)

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppSettingsService } from '@/lib/services/whatsapp/whatsapp-settings-service';

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

    const settings = await WhatsAppSettingsService.getOrCreateSettings(institutionId);
    return NextResponse.json({ data: settings });
  } catch (error) {
    console.error('[settings/whatsapp] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { institution_id, ...updates } = body;

    if (!institution_id) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Verify institution access
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (profile?.institution_id !== institution_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const settings = await WhatsAppSettingsService.updateSettings(institution_id, updates);
    return NextResponse.json({ data: settings });
  } catch (error) {
    console.error('[settings/whatsapp] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update settings' },
      { status: 500 }
    );
  }
}
