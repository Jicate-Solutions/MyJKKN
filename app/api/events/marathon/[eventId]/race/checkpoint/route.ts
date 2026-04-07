export const dynamic = 'force-dynamic';

// POST /api/events/marathon/[eventId]/race/checkpoint
// Public endpoint — records a QR checkpoint scan for a runner.
// No auth required.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkpointScanSchema } from '@/lib/validations/events-marathon';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = checkpointScanSchema.safeParse({
      ...((body as Record<string, unknown>) ?? {}),
      event_id: eventId,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createServiceRoleClient();

    const { error: insertError } = await supabase
      .from('marathon_checkpoint_scans')
      .insert({
        event_id: eventId,
        bib_number: data.bib_number,
        checkpoint_id: data.checkpoint_id,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        scanned_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[marathon-api/race/checkpoint] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to record checkpoint scan' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[marathon-api/race/checkpoint] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
