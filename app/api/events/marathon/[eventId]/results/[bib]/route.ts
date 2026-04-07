export const dynamic = 'force-dynamic';

// GET /api/events/marathon/[eventId]/results/[bib]
// Public endpoint — returns an individual runner's result by BIB number.
// No auth required.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; bib: string }> }
) {
  try {
    const { eventId, bib } = await params;

    if (!bib) {
      return NextResponse.json({ error: 'BIB number is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: result, error } = await supabase
      .from('marathon_results')
      .select(`
        id,
        bib_number,
        rank_overall,
        rank_category,
        rank_gender,
        finish_time,
        chip_time,
        gun_time,
        distance_completed_km,
        pace_per_km,
        split_times,
        certificate_id,
        certificate_url,
        created_at,
        events_registrations (
          id,
          participant_name,
          participant_gender,
          participant_age,
          participant_type,
          institution_name,
          organization,
          city,
          event_categories (
            id,
            name,
            code,
            distance_km
          )
        )
      `)
      .eq('event_id', eventId)
      .eq('bib_number', bib)
      .maybeSingle();

    if (error) {
      console.error('[marathon-api/results/bib] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch result' }, { status: 500 });
    }

    if (!result) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[marathon-api/results/bib] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
