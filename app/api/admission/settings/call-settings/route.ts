export const dynamic = 'force-dynamic';

// GET/POST /api/admission/settings/call-settings
// Manage missed-call auto-reply settings per institution

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';

// GET: Fetch institution_call_settings for the given institution_id
export async function GET(request: NextRequest) {
  await connection();
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

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('institution_call_settings')
      .select(
        'institution_id, auto_whatsapp_enabled, auto_whatsapp_template, auto_sms_enabled, auto_sms_template, auto_sms_sender_id, auto_sms_cooldown_hours, dlt_entity_id, dlt_template_id'
      )
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (error) {
      console.error('[call-settings] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch call settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[call-settings] GET unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Update auto_whatsapp_enabled, auto_whatsapp_template, auto_sms_enabled,
// auto_sms_template, auto_sms_cooldown_hours
export async function POST(request: NextRequest) {
  await connection();
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      institution_id,
      auto_whatsapp_enabled,
      auto_whatsapp_template,
      auto_sms_enabled,
      auto_sms_template,
      auto_sms_cooldown_hours,
    } = body;

    if (!institution_id) {
      return NextResponse.json(
        { error: 'institution_id is required' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const updatePayload: Record<string, unknown> = {};
    if (typeof auto_whatsapp_enabled === 'boolean')
      updatePayload.auto_whatsapp_enabled = auto_whatsapp_enabled;
    if (typeof auto_whatsapp_template === 'string')
      updatePayload.auto_whatsapp_template = auto_whatsapp_template;
    if (typeof auto_sms_enabled === 'boolean')
      updatePayload.auto_sms_enabled = auto_sms_enabled;
    if (typeof auto_sms_template === 'string')
      updatePayload.auto_sms_template = auto_sms_template;
    if (typeof auto_sms_cooldown_hours === 'number') {
      const hours = Math.trunc(auto_sms_cooldown_hours);
      if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
        return NextResponse.json(
          { error: 'auto_sms_cooldown_hours must be an integer between 1 and 168' },
          { status: 400 }
        );
      }
      updatePayload.auto_sms_cooldown_hours = hours;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('institution_call_settings')
      .update(updatePayload)
      .eq('institution_id', institution_id)
      .select()
      .single();

    if (error) {
      console.error('[call-settings] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to update call settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[call-settings] POST unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
