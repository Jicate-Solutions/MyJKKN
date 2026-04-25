import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── GET /api/bos/reports/resolution-compliance?boardId=&institutionsId= ──────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId');
    const institutionsId = searchParams.get('institutionsId');
    const academicYear = searchParams.get('academicYear');

    // Fetch agenda items with resolution text across meetings for this board
    let meetingQuery = supabase
      .from('bos_meetings')
      .select('id, meeting_number, meeting_title, academic_year, scheduled_date')
      .not('resolution_text', 'is', null);

    if (boardId) meetingQuery = meetingQuery.eq('board_id', boardId);
    if (institutionsId) meetingQuery = meetingQuery.eq('institutions_id', institutionsId);
    if (academicYear) meetingQuery = meetingQuery.eq('academic_year', academicYear);

    const { data: meetings, error: mErr } = await meetingQuery;
    if (mErr) throw mErr;

    const meetingIds = (meetings ?? []).map((m) => m.id);

    if (meetingIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: agendaItems, error: aErr } = await supabase
      .from('bos_agenda_items')
      .select('*')
      .in('meeting_id', meetingIds)
      .not('resolution_text', 'is', null)
      .order('created_at', { ascending: true });

    if (aErr) throw aErr;

    // Enrich with meeting info
    const meetingMap = new Map((meetings ?? []).map((m) => [m.id, m]));
    const enriched = (agendaItems ?? []).map((item) => ({
      ...item,
      meeting: meetingMap.get(item.meeting_id),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('[bos/reports/resolution-compliance] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch resolution compliance report' }, { status: 500 });
  }
}
