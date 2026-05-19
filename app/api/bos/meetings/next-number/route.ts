import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── GET /api/bos/meetings/next-number ────────────────────────────────────────
//
// Returns the suggested next meeting number for a composition (max(meeting_number)+1),
// plus the list of already-taken numbers so the client can validate manual overrides
// without a second round-trip.
//
// Required: compositionId
// (boardId/academicYear are accepted for back-compat but ignored when compositionId
//  is present — composition_id is the canonical scope per BoS spec.)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const compositionId = searchParams.get('compositionId');

    if (!compositionId) {
      return NextResponse.json(
        { error: 'compositionId is required' },
        { status: 400 }
      );
    }

    const { data: rows, error } = await supabase
      .from('bos_meetings')
      .select('meeting_number')
      .eq('composition_id', compositionId);

    if (error) throw error;

    const takenNumbers = (rows ?? [])
      .map((r: any) => Number(r.meeting_number))
      .filter((n) => Number.isFinite(n));
    const highest = takenNumbers.length > 0 ? Math.max(...takenNumbers) : 0;

    return NextResponse.json({
      next_number: highest + 1,
      taken_numbers: takenNumbers,
    });
  } catch (error) {
    console.error('[bos/meetings/next-number] GET error:', error);
    return NextResponse.json({ error: 'Failed to get next meeting number' }, { status: 500 });
  }
}
