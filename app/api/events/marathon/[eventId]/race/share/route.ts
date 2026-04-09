export const dynamic = 'force-dynamic';

// GET /api/events/marathon/[eventId]/race/share
// Public endpoint — returns live runner position for the family tracker.
// Query param: ?bib=KBM-2026-10K-0042
// No auth required.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const bib = request.nextUrl.searchParams.get('bib');

    if (!bib) {
      return NextResponse.json({ error: 'bib query parameter is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Fetch live GPS track for this runner
    const { data: track, error: trackError } = await supabase
      .from('marathon_race_tracks')
      .select('lat, lng, distance_km, pace_per_km, elapsed_seconds, updated_at')
      .eq('event_id', eventId)
      .eq('bib', bib)
      .maybeSingle();

    if (trackError) {
      console.error('[marathon-api/race/share] Track fetch error:', trackError);
      return NextResponse.json({ error: 'Failed to fetch runner position' }, { status: 500 });
    }

    if (!track) {
      return NextResponse.json(
        { error: 'Runner is not currently being tracked' },
        { status: 404 }
      );
    }

    // Fetch participant info from registration
    const { data: registration, error: regError } = await supabase
      .from('events_registrations')
      .select(`
        participant_name,
        participant_gender,
        event_categories (
          name,
          distance_km
        )
      `)
      .eq('event_id', eventId)
      .eq('bib_number', bib)
      .maybeSingle();

    if (regError) {
      console.warn('[marathon-api/race/share] Registration fetch error:', regError);
    }

    const reg = registration as {
      participant_name?: string;
      participant_gender?: string;
      event_categories?: { name?: string; distance_km?: number } | null;
    } | null;

    return NextResponse.json({
      data: {
        position: {
          lat: track.lat,
          lng: track.lng,
          distance_km: track.distance_km,
          pace_per_km: track.pace_per_km,
          elapsed_seconds: track.elapsed_seconds,
          last_updated: track.updated_at,
        },
        participant: {
          name: reg?.participant_name ?? null,
          gender: reg?.participant_gender ?? null,
          category: reg?.event_categories?.name ?? null,
          total_distance_km: reg?.event_categories?.distance_km ?? null,
        },
        bib,
      },
    });
  } catch (error) {
    console.error('[marathon-api/race/share] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
