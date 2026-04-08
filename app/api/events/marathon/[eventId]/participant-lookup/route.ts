

// GET /api/events/marathon/[eventId]/participant-lookup?phone=9876543210
// Public endpoint — checks whether a phone number belongs to a returning external
// participant. Used by the external registration app to pre-fill form fields.
//
// Response shapes:
//   { exists: true,  name: string, email: string | null }
//   { exists: false }
//
// The eventId param is intentionally validated (event must exist and be public)
// to prevent using this endpoint as a general phone-lookup service.

import { NextRequest, NextResponse } from 'next/server';
import { ExternalParticipantService } from '@/lib/services/events/core/external-participant-service';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const phone = request.nextUrl.searchParams.get('phone')?.trim();

    if (!phone || phone.length < 10) {
      return NextResponse.json(
        { error: 'A valid phone number is required (?phone=...)' },
        { status: 400 }
      );
    }

    // Validate that the event exists and is publicly accessible
    const supabase = createServiceRoleClient();
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, is_public, allow_external_registration')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (!event.is_public || !event.allow_external_registration) {
      return NextResponse.json(
        { error: 'External registrations are not enabled for this event' },
        { status: 403 }
      );
    }

    // Look up the participant by phone
    const participant = await ExternalParticipantService.findByPhone(phone);

    if (!participant) {
      return NextResponse.json({ exists: false });
    }

    // Return only the fields needed to pre-fill the registration form
    return NextResponse.json({
      exists: true,
      name: participant.full_name,
      email: participant.email ?? null,
    });
  } catch (error) {
    console.error('[marathon-api/participant-lookup] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
