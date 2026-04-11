export const dynamic = 'force-dynamic';

// GET /api/events/marathon/[eventId]/qr/[bibNumber]
// Generates a branded QR code PNG for a single marathon participant.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateMarathonQR } from '@/lib/utils/marathon-qr-generator';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string; bibNumber: string }> }
) {
  try {
    const { eventId, bibNumber } = await params;
    const supabase = createServiceRoleClient();

    // Fetch event name
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, event_name')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Fetch registration with stall join
    const { data: reg, error: regError } = await supabase
      .from('events_registrations')
      .select('participant_name, stall_id, events_stalls(stall_code)')
      .eq('event_id', eventId)
      .eq('bib_number', bibNumber)
      .single();

    if (regError || !reg) {
      return NextResponse.json(
        { error: `Registration not found for BIB ${bibNumber}` },
        { status: 404 }
      );
    }

    const stallCode =
      reg.events_stalls && typeof reg.events_stalls === 'object' && 'stall_code' in reg.events_stalls
        ? (reg.events_stalls as { stall_code: string }).stall_code
        : null;

    const image = await generateMarathonQR({
      bibNumber,
      participantName: reg.participant_name,
      stallCode,
      eventName: event.event_name,
    });

    return new NextResponse(image, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Content-Disposition': `inline; filename="${bibNumber}.png"`,
      },
    });
  } catch (error) {
    console.error('[marathon-api/qr] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
