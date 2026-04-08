

// GET /api/events/marathon/[eventId]/stats
// Public endpoint — returns registration counts aggregated by category, status, and type.
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

    // Fetch all registrations for this event with category name
    const { data: registrations, error } = await supabase
      .from('events_registrations')
      .select('id, status, participant_type, category_id, event_categories(name)')
      .eq('event_id', eventId);

    if (error) {
      console.error('[marathon-api/stats] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }

    const rows = registrations ?? [];
    const total = rows.length;

    // Aggregate by category
    const categoryMap: Record<string, { name: string; count: number }> = {};
    for (const row of rows) {
      const catId = row.category_id as string;
      const catName =
        (row.event_categories as { name: string } | null)?.name ?? 'Unknown';
      if (!categoryMap[catId]) {
        categoryMap[catId] = { name: catName, count: 0 };
      }
      categoryMap[catId].count++;
    }
    const by_category = Object.values(categoryMap);

    // Aggregate by status
    const statusMap: Record<string, number> = {};
    for (const row of rows) {
      const s = (row.status as string) ?? 'unknown';
      statusMap[s] = (statusMap[s] ?? 0) + 1;
    }
    const by_status = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // Checked-in count
    const checked_in = rows.filter((r) => r.status === 'checked_in').length;

    // Internal vs external
    const internal_count = rows.filter((r) => r.participant_type === 'internal').length;
    const external_count = rows.filter((r) => r.participant_type === 'external').length;

    return NextResponse.json({
      data: {
        total,
        by_category,
        by_status,
        checked_in,
        internal_count,
        external_count,
      },
    });
  } catch (error) {
    console.error('[marathon-api/stats] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
