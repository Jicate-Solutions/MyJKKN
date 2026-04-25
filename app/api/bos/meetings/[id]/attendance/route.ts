import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BosAttendanceStatus } from '@/types/bos';

// ── GET /api/bos/meetings/[id]/attendance ─────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: meetingId } = await params;

    const { data, error } = await supabase
      .from('bos_meeting_attendees')
      .select(`
        *,
        member:bos_members (
          id, display_name, display_designation, display_institution,
          member_type, is_active, sort_order
        )
      `)
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[bos/attendance] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}

// ── POST /api/bos/meetings/[id]/attendance ────────────────────────────────────
// Accepts an array of attendance records and upserts them in bulk.
// Each record: { member_id, attendance_status, absence_reason?, ta_da_eligible? }
interface AttendanceUpsertRecord {
  member_id: string;
  attendance_status: BosAttendanceStatus;
  absence_reason?: string;
  ta_da_eligible?: boolean;
  institutions_id: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: meetingId } = await params;
    const records: AttendanceUpsertRecord[] = await request.json();

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'records array is required' }, { status: 400 });
    }

    const upsertData = records.map((r) => ({
      meeting_id: meetingId,
      member_id: r.member_id,
      institutions_id: r.institutions_id,
      attendance_status: r.attendance_status,
      absence_reason: r.absence_reason ?? null,
      ta_da_eligible: r.ta_da_eligible ?? false,
    }));

    const { data, error } = await supabase
      .from('bos_meeting_attendees')
      .upsert(upsertData, { onConflict: 'meeting_id,member_id', ignoreDuplicates: false })
      .select(`
        *,
        member:bos_members (
          id, display_name, display_designation, display_institution,
          member_type, is_active, sort_order
        )
      `);

    if (error) throw error;

    return NextResponse.json(data ?? [], { status: 201 });
  } catch (error) {
    console.error('[bos/attendance] POST error:', error);
    return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
  }
}
