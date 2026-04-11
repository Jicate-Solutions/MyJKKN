export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateMarathonQR } from '@/lib/utils/marathon-qr-generator';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const force = body.force === true;
  const specificBibs: string[] | undefined = body.bibNumbers;

  const supabase = createServiceRoleClient();

  // Fetch event name
  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // Build query for registrations to generate
  let query = supabase
    .from('events_registrations')
    .select('id, bib_number, participant_name, stall:events_stalls(stall_code)')
    .eq('event_id', eventId)
    .not('bib_number', 'is', null)
    .order('bib_number');

  if (specificBibs && specificBibs.length > 0) {
    query = query.in('bib_number', specificBibs);
  } else if (!force) {
    // Only registrations without QR
    query = query.is('qr_code_url', null);
  }

  const { data: registrations } = await query;

  if (!registrations || registrations.length === 0) {
    return NextResponse.json({
      generated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      message: 'No registrations to generate',
    });
  }

  let generated = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in chunks of 20
  for (let i = 0; i < registrations.length; i += 20) {
    const chunk = registrations.slice(i, i + 20);

    await Promise.all(
      chunk.map(async (reg: any) => {
        try {
          const stallCode =
            reg.stall &&
            typeof reg.stall === 'object' &&
            'stall_code' in reg.stall
              ? (reg.stall as { stall_code: string }).stall_code
              : null;

          const imageBuffer = await generateMarathonQR({
            bibNumber: reg.bib_number,
            participantName: reg.participant_name,
            stallCode,
            eventName: event.name,
          });

          // Upload to Supabase Storage (upsert)
          const filePath = `${eventId}/${reg.bib_number}.png`;
          const { error: uploadError } = await supabase.storage
            .from('marathon-qr-codes')
            .upload(filePath, imageBuffer, {
              contentType: 'image/png',
              upsert: true,
            });

          if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('marathon-qr-codes')
            .getPublicUrl(filePath);

          // Update registration with QR URL
          await supabase
            .from('events_registrations')
            .update({
              qr_code_url: urlData.publicUrl,
              qr_generated_at: new Date().toISOString(),
            })
            .eq('id', reg.id);

          generated++;
        } catch (err: any) {
          failed++;
          errors.push(`${reg.bib_number}: ${err.message}`);
        }
      })
    );
  }

  const skipped = registrations.length - generated - failed;

  return NextResponse.json({
    generated,
    skipped,
    failed,
    errors: errors.slice(0, 20),
  });
}
