import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── GET /api/bos/meetings/[id]/email-status ──────────────────────────────────
// Returns the LATEST send-log row per member for this meeting, keyed by
// member_id. Members with no log row are absent from the map — the client
// renders them as "Not Sent / Pending".

interface MemberStatusEntry {
  status: 'sent' | 'failed';
  sent_at: string;
  message_id: string | null;
  error_message: string | null;
}

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

    // Pull every log row for the meeting, newest first. We collapse to
    // one-per-member client-side using the first occurrence in the sort
    // order. Cheaper than a window-function on Postgres for the small
    // row counts a single meeting produces (<= 100 members typically).
    const { data, error } = await supabase
      .from('bos_email_send_log')
      .select('member_id, status, sent_at, message_id, error_message')
      .eq('meeting_id', meetingId)
      .order('sent_at', { ascending: false });

    if (error) {
      console.error('[bos/meetings/email-status] query error:', error);
      return NextResponse.json(
        { error: error.message ?? 'Failed to load email status' },
        { status: 500 }
      );
    }

    const byMemberId: Record<string, MemberStatusEntry> = {};
    for (const row of data ?? []) {
      const memberId = row.member_id as string | null;
      if (!memberId) continue;
      // Skip if we already recorded a newer row for this member (rows are
      // pre-sorted newest-first, so the first hit wins).
      if (byMemberId[memberId]) continue;
      byMemberId[memberId] = {
        status: row.status as 'sent' | 'failed',
        sent_at: row.sent_at as string,
        message_id: (row.message_id as string | null) ?? null,
        error_message: (row.error_message as string | null) ?? null,
      };
    }

    return NextResponse.json({ byMemberId });
  } catch (error) {
    console.error('[bos/meetings/email-status] error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to load email status' },
      { status: 500 }
    );
  }
}
