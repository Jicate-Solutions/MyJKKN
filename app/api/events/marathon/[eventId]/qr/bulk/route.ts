export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// GET /api/events/marathon/[eventId]/qr/bulk
// Generates a ZIP file containing branded QR code PNGs for ALL registrations.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateMarathonQR } from '@/lib/utils/marathon-qr-generator';
import archiver from 'archiver';
import { PassThrough } from 'stream';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
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

    // Fetch all registrations with stall join, ordered by bib_number
    const { data: registrations, error: regError } = await supabase
      .from('events_registrations')
      .select('bib_number, participant_name, stall_id, events_stalls(stall_code)')
      .eq('event_id', eventId)
      .not('bib_number', 'is', null)
      .order('bib_number', { ascending: true });

    if (regError) {
      console.error('[marathon-api/qr-bulk] Query error:', regError.message);
      return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 });
    }

    if (!registrations || registrations.length === 0) {
      return NextResponse.json(
        { error: 'No registrations found for this event' },
        { status: 404 }
      );
    }

    // Build ZIP archive
    const archive = archiver('zip', { zlib: { level: 5 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    for (const reg of registrations) {
      const stallCode =
        reg.events_stalls && typeof reg.events_stalls === 'object' && 'stall_code' in reg.events_stalls
          ? (reg.events_stalls as { stall_code: string }).stall_code
          : null;

      const image = await generateMarathonQR({
        bibNumber: reg.bib_number,
        participantName: reg.participant_name,
        stallCode,
        eventName: event.event_name,
      });

      archive.append(image, { name: `${reg.bib_number}.png` });
    }

    await archive.finalize();

    // Collect all chunks into a single buffer
    const chunks: Buffer[] = [];
    for await (const chunk of passthrough) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="qr-codes-${eventId}.zip"`,
      },
    });
  } catch (error) {
    console.error('[marathon-api/qr-bulk] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
