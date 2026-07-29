import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { counsellingCodeFor } from '@/lib/utils/bos/institution-scope';
import { resolveBosBoardScope, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';

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

    // Read-only observer: holds the reports view grant but sits on no board —
    // may READ resolution compliance across every institution. Service-role
    // bypasses the board-scoped RLS that would otherwise return empty. VIEW ONLY.
    const scope = await resolveBosBoardScope(user.id);
    const canReadAllBos = isBosReadAllObserver(
      scope,
      await hasBosPermission(user.id, 'academic.bos-reports.view')
    );
    const db = canReadAllBos ? createServiceRoleClient() : supabase;

    // Fetch meetings matching the filters, then find their agenda items with resolutions.
    // Note: resolution_text lives on bos_agenda_items, not bos_meetings.
    let meetingQuery = db
      .from('bos_meetings')
      .select('id, meeting_number, meeting_title, academic_year, scheduled_date');

    if (boardId) meetingQuery = meetingQuery.eq('board_id', boardId);
    // CAS-aware via the denormalized counselling_code (spans Aided + SF).
    if (institutionsId) {
      const code = await counsellingCodeFor(db, institutionsId);
      meetingQuery = code
        ? meetingQuery.eq('counselling_code', code)
        : meetingQuery.eq('institutions_id', institutionsId);
    }
    if (academicYear) meetingQuery = meetingQuery.eq('academic_year', academicYear);

    const { data: meetings, error: mErr } = await meetingQuery;
    if (mErr) throw mErr;

    const meetingIds = (meetings ?? []).map((m) => m.id);

    if (meetingIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: agendaItems, error: aErr } = await db
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
