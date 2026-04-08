

// GET /api/events/marathon/[eventId]/registrations/[phone]
// Public endpoint — looks up a registration by participant phone number.
// No auth required.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; phone: string }> }
) {
  try {
    const { eventId, phone } = await params;

    if (!phone || phone.length < 7) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: registration, error } = await supabase
      .from('events_registrations')
      .select(`
        id,
        bib_number,
        participant_name,
        participant_phone,
        participant_email,
        participant_age,
        participant_gender,
        participant_type,
        status,
        institution_name,
        department,
        organization,
        city,
        source,
        created_at,
        event_categories (
          id,
          name,
          code,
          distance_km,
          fee_amount
        )
      `)
      .eq('event_id', eventId)
      .eq('participant_phone', phone)
      .maybeSingle();

    if (error) {
      console.error('[marathon-api/registrations/phone] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch registration' }, { status: 500 });
    }

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    return NextResponse.json({ data: registration });
  } catch (error) {
    console.error('[marathon-api/registrations/phone] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
