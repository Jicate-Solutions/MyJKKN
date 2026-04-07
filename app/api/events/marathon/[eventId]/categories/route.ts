export const dynamic = 'force-dynamic';

// GET /api/events/marathon/[eventId]/categories
// Public endpoint — returns race categories for a marathon event.
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

    const { data: categories, error } = await supabase
      .from('event_categories')
      .select(`
        id,
        name,
        code,
        description,
        distance_km,
        max_participants,
        min_age,
        max_age,
        fee_amount,
        early_bird_fee,
        early_bird_deadline,
        sort_order,
        is_active,
        config
      `)
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[marathon-api/categories] DB error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch categories' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: categories ?? [] });
  } catch (error) {
    console.error('[marathon-api/categories] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
