// app/api/meetings/record/[uid]/route.ts
//
// GET /api/meetings/record/{uid} — the finished record of one meeting as a PDF
// (summary, decisions, follow-ups, people by name).
//
// Auth is checked HERE, before anything else: the proxy does not gate /api, and
// launching Chromium for an anonymous caller would be free compute for anyone.
// Every read runs as the signed-in viewer (loadMeetingRecord uses their session
// client), so only people who can open /meetings/{uid} — the host, and admins —
// get anything, and a booking RLS hides answers 404, not 403, so a uid cannot
// be probed for existence. The PDF lists who was on the call, which the page
// does not; it prints their names only, never an email address or a link.
//
// The route repeats the button's rule before it starts Chromium: the meeting
// must be over AND have a linked note or at least one follow-up. Anything else
// is 404 — a scheduled meeting has no record yet.
//
// Any failed read is a 500 with a plain message, never a PDF with empty
// sections for a meeting that has content.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isMeetingRecordReady, loadMeetingRecord } from '@/lib/services/meetings/meeting-record';
import {
  buildMeetingRecordHtml,
  meetingRecordFilename,
  meetingRecordFooterText,
} from '@/lib/pdf/meeting-record-pdf';
import { renderSyllabusPdf } from '@/lib/pdf/syllabus-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const FAILED = 'Could not make the PDF. Try again in a moment.';

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
    return NextResponse.json({ error: 'Please sign in again to download this record.' }, { status: 401 });
  }

  try {
    const record = await loadMeetingRecord(supabase, uid);
    if (!record) {
      return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
    }
    if (!isMeetingRecordReady(record)) {
      return NextResponse.json(
        { error: 'Nothing has been recorded for this meeting yet.' },
        { status: 404 },
      );
    }

    const { data: viewer, error: viewerError } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    if (viewerError) {
      console.error('[meetings/record] viewer read failed:', viewerError.message);
      return NextResponse.json({ error: FAILED }, { status: 500 });
    }
    // A name only — the footer never carries an email address.
    const viewerName = (viewer?.full_name as string | null | undefined)?.trim() || null;

    const html = buildMeetingRecordHtml(record, { generatedAt: new Date(), viewerName });
    const pdf = await renderSyllabusPdf(html, { footerText: meetingRecordFooterText(record) });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${meetingRecordFilename(record)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[meetings/record] PDF generation failed:', err);
    return NextResponse.json({ error: FAILED }, { status: 500 });
  }
}
