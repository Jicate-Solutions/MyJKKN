export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { quoteUpfrontFee } from '@/lib/services/campus-living/hostel-fee-compute-service';
import type { QuoteUpfrontFeeInput } from '@/types/hostel-fee-compute';

/**
 * POST /api/campus-living/fee-quote
 *
 * Read-only upfront fractional-occupancy fee quote. Given a room + category +
 * active occupants (+ optional mess category and join date), returns the
 * per-learner FeeBreakdown and optional pro-rata. NO writes.
 *
 * Body: { roomId, roomCategoryId, activeOccupants, messCategoryId?, hostelYearId, joinDate? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<QuoteUpfrontFeeInput>;

    if (!body.roomId || !body.roomCategoryId || !body.hostelYearId) {
      return NextResponse.json(
        { error: 'roomId, roomCategoryId and hostelYearId are required' },
        { status: 400 }
      );
    }
    const activeOccupants = Number(body.activeOccupants);
    if (!Number.isFinite(activeOccupants) || activeOccupants < 1) {
      return NextResponse.json(
        { error: 'activeOccupants must be a positive integer' },
        { status: 400 }
      );
    }

    const result = await quoteUpfrontFee({
      roomId: body.roomId,
      roomCategoryId: body.roomCategoryId,
      activeOccupants,
      messCategoryId: body.messCategoryId ?? null,
      hostelYearId: body.hostelYearId,
      joinDate: body.joinDate ?? null,
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    const status = msg === 'Hostel year not found' || msg === 'Room not found' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
