export const dynamic = 'force-dynamic';

// POST /api/events/marathon/[eventId]/race/track
// Public endpoint — batch GPS sync from the runner's PWA.
// Upserts the live track record and inserts raw GPS points.
// No auth required.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { gpsSyncSchema } from '@/lib/validations/events-marathon';

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

    const parsed = gpsSyncSchema.safeParse({ ...((body as Record<string, unknown>) ?? {}), event_id: eventId });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createServiceRoleClient();

    // Upsert the live track summary (one row per event+bib)
    const { error: trackError } = await supabase
      .from('marathon_race_tracks')
      .upsert(
        {
          event_id: eventId,
          bib: data.bib,
          lat: data.lat,
          lng: data.lng,
          distance_km: data.distance_km,
          pace_per_km: data.pace_per_km,
          elapsed_seconds: data.elapsed_seconds,
          altitude: data.altitude ?? null,
          heading: data.heading ?? null,
          speed: data.speed ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,bib' }
      );

    if (trackError) {
      console.error('[marathon-api/race/track] Upsert error:', trackError);
      return NextResponse.json({ error: 'Failed to save GPS track' }, { status: 500 });
    }

    // Insert individual GPS points if provided
    if (data.points && data.points.length > 0) {
      const points = data.points.map((p) => ({
        event_id: eventId,
        bib: data.bib,
        lat: p.lat,
        lng: p.lng,
        speed: p.speed ?? null,
        accuracy: p.accuracy ?? null,
        altitude: p.altitude ?? null,
        recorded_at: p.timestamp,
      }));

      const { error: pointsError } = await supabase
        .from('marathon_race_track_points')
        .insert(points);

      if (pointsError) {
        // Non-fatal — track summary already saved
        console.warn('[marathon-api/race/track] Points insert error:', pointsError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[marathon-api/race/track] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
