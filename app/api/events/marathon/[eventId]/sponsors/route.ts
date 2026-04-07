export const dynamic = 'force-dynamic';

// GET /api/events/marathon/[eventId]/sponsors
// Public endpoint — returns committed sponsors for the event.
// No auth required.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createServiceRoleClient();

    const { data: sponsors, error } = await supabase
      .from('marathon_sponsors')
      .select('id, company_name, logo_url, website, tier, pipeline_stage')
      .eq('event_id', eventId)
      .eq('pipeline_stage', 'committed')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[marathon-api/sponsors] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch sponsors' }, { status: 500 });
    }

    return NextResponse.json({ data: sponsors ?? [] });
  } catch (error) {
    console.error('[marathon-api/sponsors] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
