// app/api/admission/chatbot/config/route.ts
// Authenticated endpoint — CRUD chatbot configuration

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUser } from '@/lib/supabase/server';

/**
 * GET /api/admission/chatbot/config
 *
 * Query: { institution_id }
 * Returns: { config } (single config per institution)
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

    if (!institutionId) {
      return NextResponse.json(
        { error: 'institution_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('chatbot_configs')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found — that's ok, just means no config yet
      console.error('[api/admission/chatbot/config] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
    }

    return NextResponse.json({ config: data || null });
  } catch (error) {
    console.error('[api/admission/chatbot/config] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admission/chatbot/config
 *
 * Body: { institution_id, name, welcome_message, system_prompt?, ... }
 * Creates or updates config
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      institution_id,
      name,
      welcome_message,
      system_prompt,
      enabled_channels,
      languages,
      business_hours,
      handoff_triggers,
      max_turns_before_handoff,
      collect_contact_info,
      is_active,
    } = body;

    if (!institution_id) {
      return NextResponse.json(
        { error: 'institution_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Check if config already exists
    const { data: existing } = await supabase
      .from('chatbot_configs')
      .select('id')
      .eq('institution_id', institution_id)
      .limit(1)
      .single();

    const configData: Record<string, unknown> = {
      institution_id,
      name: name || 'JKKN Admissions Assistant',
      welcome_message: welcome_message || 'Hello! I am the JKKN Admissions Assistant. How can I help you today?',
      updated_at: new Date().toISOString(),
    };

    if (system_prompt !== undefined) configData.system_prompt = system_prompt;
    if (enabled_channels !== undefined) configData.enabled_channels = enabled_channels;
    if (languages !== undefined) configData.languages = languages;
    if (business_hours !== undefined) configData.business_hours = business_hours;
    if (handoff_triggers !== undefined) configData.handoff_triggers = handoff_triggers;
    if (max_turns_before_handoff !== undefined) configData.max_turns_before_handoff = max_turns_before_handoff;
    if (collect_contact_info !== undefined) configData.collect_contact_info = collect_contact_info;
    if (is_active !== undefined) configData.is_active = is_active;

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('chatbot_configs')
        .update(configData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from('chatbot_configs')
        .insert(configData)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json(
      { config: result, message: existing ? 'Config updated' : 'Config created' },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error('[api/admission/chatbot/config] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/admission/chatbot/config
 *
 * Body: { id, ...fields }
 * Updates specific fields
 */
export async function PUT(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Config id is required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('chatbot_configs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ config: data, message: 'Config updated' });
  } catch (error) {
    console.error('[api/admission/chatbot/config] PUT Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
