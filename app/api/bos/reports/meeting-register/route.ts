import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { counsellingCodeFor } from '@/lib/utils/bos/institution-scope';

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
        id, meeting_number, meeting_title, academic_year, board_id, institutions_id,
        scheduled_date, actual_date, status, meeting_type, quorum_met
      `)
      .order('academic_year', { ascending: false })
      .order('meeting_number', { ascending: true });

    if (boardId) query = query.eq('board_id', boardId);
    if (academicYear) query = query.eq('academic_year', academicYear);
    // CAS-aware via the denormalized counselling_code: includes meetings filed
    // under either Aided/Self-Financing UUID of the selected institution.
    if (institutionsId) {
      const code = await counsellingCodeFor(supabase, institutionsId);
      query = code
        ? query.eq('counselling_code', code)
        : query.eq('institutions_id', institutionsId);
    }

    const { data: meetings, error } = await query;
    if (error) throw error;

    // Batch-fetch boards from COE API for all institutions in the result set
    const institutionIdsInResult = [...new Set((meetings ?? []).map((m: any) => m.institutions_id).filter(Boolean))];
    const { fetchCoeBoardMaps } = await import('@/lib/utils/bos/coe-boards');
    const boardMap = institutionIdsInResult.length
      ? await fetchCoeBoardMaps(institutionIdsInResult)
      : new Map();

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
          board: boardMap.get(m.board_id) ?? null,
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
