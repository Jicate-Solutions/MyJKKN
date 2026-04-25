import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── GET /api/bos/meetings/next-number?boardId=&academicYear= ─────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId');
    const academicYear = searchParams.get('academicYear');

    if (!boardId || !academicYear) {
      return NextResponse.json(
        { error: 'boardId and academicYear are required' },
        { status: 400 }
      );
    }

    const { count } = await supabase
      .from('bos_meetings')
      .select('id', { count: 'exact', head: true })
      .eq('board_id', boardId)
      .eq('academic_year', academicYear);

    return NextResponse.json({ next_number: (count ?? 0) + 1 });
  } catch (error) {
    console.error('[bos/meetings/next-number] GET error:', error);
    return NextResponse.json({ error: 'Failed to get next meeting number' }, { status: 500 });
  }
}
