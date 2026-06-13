/**
 * POST /api/pde/demonstrations/[id]/score
 * ============================================================================
 * Triggers the scoring engine for a validated demonstration.
 *
 * Auth: relies on Supabase RLS — the route reads the authenticated user via
 * `supabase.auth.getUser()` and the row-level policies on `pde_demonstrations`
 * enforce that only faculty/hod/coordinator/dean/admin in the same institution
 * can write the score fields.
 *
 * Body: none required.
 *
 * Returns: { data: PdeDemonstrationRow } with raw_score, weighted_score,
 * passed, scored_at populated and status flipped to 'scored'.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PDEScoringService } from '@/lib/services/pde-scoring-service';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scored = await PDEScoringService.scoreAndPersist(id);
    return NextResponse.json({ data: scored });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
