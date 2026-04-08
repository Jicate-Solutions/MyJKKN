

// GET /api/events/marathon/[eventId]/verify/[certId]
// Public endpoint — verifies a finisher certificate by certificate ID.
// No auth required. Returns { valid: true, ... } or { valid: false }.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; certId: string }> }
) {
  try {
    const { certId } = await params;

    if (!certId) {
      return NextResponse.json({ valid: false, error: 'Certificate ID is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: result, error } = await supabase
      .from('marathon_results')
      .select(`
        id,
        bib_number,
        rank_overall,
        finish_time,
        certificate_id,
        certificate_url,
        events_registrations (
          participant_name,
          event_categories (
            name,
            distance_km
          )
        ),
        events (
          name,
          event_date,
          venue
        )
      `)
      .eq('certificate_id', certId)
      .maybeSingle();

    if (error) {
      console.error('[marathon-api/verify] DB error:', error);
      return NextResponse.json({ valid: false, error: 'Verification failed' }, { status: 500 });
    }

    if (!result) {
      return NextResponse.json({ valid: false }, { status: 404 });
    }

    const reg = result.events_registrations as {
      participant_name?: string;
      event_categories?: { name?: string; distance_km?: number } | null;
    } | null;

    const evt = result.events as {
      name?: string;
      event_date?: string;
      venue?: string;
    } | null;

    return NextResponse.json({
      valid: true,
      data: {
        certificate_id: result.certificate_id,
        certificate_url: result.certificate_url,
        participant_name: reg?.participant_name ?? null,
        event_name: evt?.name ?? null,
        event_date: evt?.event_date ?? null,
        venue: evt?.venue ?? null,
        category: reg?.event_categories?.name ?? null,
        distance_km: reg?.event_categories?.distance_km ?? null,
        finish_time: result.finish_time,
        rank_overall: result.rank_overall,
        bib_number: result.bib_number,
      },
    });
  } catch (error) {
    console.error('[marathon-api/verify] GET error:', error);
    return NextResponse.json({ valid: false, error: 'Internal server error' }, { status: 500 });
  }
}
