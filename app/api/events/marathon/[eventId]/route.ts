

// GET /api/events/marathon/[eventId]
// Public endpoint — returns event details with categories for the external marathon app.
// No auth required; uses service role client to bypass RLS.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createServiceRoleClient();

    const { data: event, error } = await supabase
      .from('events')
      .select(`
        id,
        institution_id,
        event_type,
        name,
        slug,
        description,
        theme,
        tagline,
        event_date,
        start_time,
        venue,
        venue_address,
        venue_coordinates,
        status,
        config,
        registration_config,
        branding_config,
        route_config,
        target_registrations,
        max_registrations,
        is_public,
        allow_external_registration,
        hero_image_url,
        hero_video_url,
        year,
        registration_open_date,
        registration_close_date,
        created_at,
        event_categories (
          id,
          name,
          code,
          description,
          distance_km,
          max_participants,
          min_age,
          max_age,
          fee_amount,
          early_bird_fee,
          early_bird_deadline,
          sort_order,
          is_active
        )
      `)
      .eq('id', eventId)
      .eq('is_public', true)
      .single();

    if (error || !event) {
      return NextResponse.json(
        { error: 'Event not found or not public' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: event });
  } catch (error) {
    console.error('[marathon-api/event] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
