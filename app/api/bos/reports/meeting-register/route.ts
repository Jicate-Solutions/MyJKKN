import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── GET /api/bos/reports/meeting-register?boardId=&academicYear= ─────────────
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
    const institutionsId = searchParams.get('institutionsId');

    let query = supabase
      .from('bos_meetings')
      .select(`
        id, meeting_number, meeting_title, academic_year, board_id, scheduled_date,
        actual_date, status, meeting_type, quorum_met
      `)
      .order('academic_year', { ascending: false })
      .order('meeting_number', { ascending: true });

    if (boardId) query = query.eq('board_id', boardId);
    if (academicYear) query = query.eq('academic_year', academicYear);
    if (institutionsId) query = query.eq('institutions_id', institutionsId);

    const { data: meetings, error } = await query;
    if (error) throw error;

    // For each meeting, get attendee count and agenda item count
    const enriched = await Promise.all(
      (meetings ?? []).map(async (m) => {
        const [{ count: attendeeCount }, { count: agendaCount }] = await Promise.all([
          supabase.from('bos_meeting_attendees')
            .select('id', { count: 'exact', head: true })
            .eq('meeting_id', m.id)
            .eq('attendance_status', 'present'),
          supabase.from('bos_agenda_items')
            .select('id', { count: 'exact', head: true })
            .eq('meeting_id', m.id),
        ]);
        return {
          ...m,
          attendee_count: attendeeCount ?? 0,
          agenda_item_count: agendaCount ?? 0,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('[bos/reports/meeting-register] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch meeting register' }, { status: 500 });
  }
}
