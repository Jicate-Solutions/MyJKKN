// app/api/meetings/record/[uid]/route.ts
//
// GET /api/meetings/record/{uid} — the finished record of one meeting as a PDF
// (summary, decisions, follow-ups, people).
//
// Auth is checked HERE, before anything else: the proxy does not gate /api, and
// launching Chromium for an anonymous caller would be free compute for anyone.
// Every read runs as the signed-in viewer (loadMeetingRecord uses their session
// client), so the PDF holds exactly what /meetings/{uid} shows that person —
// and nothing when RLS hides the booking, which answers 404, not 403, so a uid
// cannot be probed for existence.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { loadMeetingRecord } from '@/lib/services/meetings/meeting-record';
import {
  buildMeetingRecordHtml,
  meetingRecordFilename,
  renderMeetingRecordPdf,
} from '@/lib/pdf/meeting-record-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  // Native meeting tables are not in the generated types → untyped client.
  const supabase = (await createClient()) as unknown as SupabaseClient;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to download this record.' }, { status: 401 });
  }

  try {
    const record = await loadMeetingRecord(supabase, uid);
    if (!record) {
      return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
    }

    const { data: viewer } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    const viewerName =
      (viewer?.full_name as string | null | undefined) ||
      (viewer?.email as string | null | undefined) ||
      user.email ||
      null;

    const html = buildMeetingRecordHtml(record, { generatedAt: new Date(), viewerName });
    const pdf = await renderMeetingRecordPdf(html);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${meetingRecordFilename(record)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[meetings/record] PDF generation failed:', err);
    return NextResponse.json({ error: 'Could not build the meeting record.' }, { status: 500 });
  }
}
