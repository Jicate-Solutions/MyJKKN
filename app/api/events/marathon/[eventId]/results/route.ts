export const dynamic = 'force-dynamic';

// GET /api/events/marathon/[eventId]/results
// Public endpoint — returns the public leaderboard with optional filters.
// Query params: ?category_id=UUID&limit=50&offset=0&search=text
// No auth required.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const { searchParams } = request.nextUrl;

    const category_id = searchParams.get('category_id');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);
    const search = searchParams.get('search')?.trim();

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('marathon_results')
      .select(
        `
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
        certificate_id,
        created_at,
        events_registrations (
          id,
          participant_name,
          participant_gender,
          participant_age,
          participant_type,
          institution_name,
          event_categories (
            id,
            name,
            code,
            distance_km
          )
        )
      `,
        { count: 'exact' }
      )
      .eq('event_id', eventId)
      .order('rank_overall', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category_id) {
      // Filter by category via the registration join
      query = query.eq('events_registrations.category_id', category_id);
    }

    const { data: results, error, count } = await query;

    if (error) {
      console.error('[marathon-api/results] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
    }

    // Apply in-memory search filter if provided (search by name or BIB)
    let filtered = results ?? [];
    if (search) {
      const lower = search.toLowerCase();
      filtered = filtered.filter((r) => {
        const reg = r.events_registrations as { participant_name?: string } | null;
        return (
          r.bib_number?.toLowerCase().includes(lower) ||
          reg?.participant_name?.toLowerCase().includes(lower)
        );
      });
    }

    return NextResponse.json({
      data: filtered,
      pagination: {
        total: count ?? 0,
        limit,
        offset,
        has_more: offset + limit < (count ?? 0),
      },
    });
  } catch (error) {
    console.error('[marathon-api/results] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
