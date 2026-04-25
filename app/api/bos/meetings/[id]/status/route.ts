import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BosMeetingStatus, BOS_MEETING_NEXT_STATUS } from '@/types/bos';

// ── PATCH /api/bos/meetings/[id]/status ──────────────────────────────────────
// Transitions a meeting to the next valid state in the state machine.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const newStatus: BosMeetingStatus = body.status;

    // Fetch current meeting
    const { data: meeting, error: fetchError } = await supabase
      .from('bos_meetings')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const currentStatus = meeting.status as BosMeetingStatus;
    const allowedNext = BOS_MEETING_NEXT_STATUS[currentStatus];

    if (allowedNext !== newStatus) {
      return NextResponse.json(
        {
          error: `Invalid status transition: ${currentStatus} → ${newStatus}. Expected next: ${allowedNext ?? 'none (final state)'}`,
        },
        { status: 422 }
      );
    }

    // Build update payload — include metadata timestamps per transition
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'principal_approved') {
      updatePayload.principal_approved_at = body.principal_approved_at ?? new Date().toISOString();
      if (body.principal_approved_by) {
        updatePayload.principal_approved_by = body.principal_approved_by;
      }
    }

    if (newStatus === 'completed') {
      if (body.actual_date) updatePayload.actual_date = body.actual_date;
      if (body.actual_start_time) updatePayload.actual_start_time = body.actual_start_time;
      if (body.actual_end_time) updatePayload.actual_end_time = body.actual_end_time;
      if (body.quorum_met !== undefined) updatePayload.quorum_met = body.quorum_met;
    }

    if (newStatus === 'minutes_drafted') {
      updatePayload.minutes_drafted_at = new Date().toISOString();
      if (body.minutes_summary) updatePayload.minutes_summary = body.minutes_summary;
    }

    if (newStatus === 'minutes_approved') {
      updatePayload.minutes_approved_at = new Date().toISOString();
      if (body.minutes_approved_by) updatePayload.minutes_approved_by = body.minutes_approved_by;
    }

    if (newStatus === 'ratified') {
      updatePayload.ratified_by_ac = true;
      if (body.ratified_date) updatePayload.ratified_date = body.ratified_date;
    }

    const { data, error } = await supabase
      .from('bos_meetings')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/meetings/:id/status] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to transition meeting status' }, { status: 500 });
  }
}
