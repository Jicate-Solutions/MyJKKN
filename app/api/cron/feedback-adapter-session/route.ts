export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Feedback adapter: session_feedback → feedback_events.
 *
 * Normalizes each session_feedback row (a learner's per-session rating +
 * optional free_text) into the universal spine. Pure capture — no AI here;
 * the daily classify routine (Claude subscription) fills the ai_* fields later.
 *
 * Idempotent: ingest dedups on (source, source_ref), so re-running never
 * duplicates. Auth: CRON_SECRET via ?secret= query or Authorization: Bearer
 * (matches the project's other cron routes).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ingestFeedbackEvents } from '@/lib/services/feedback/feedback-ingest';
import type { FeedbackEventInput } from '@/lib/types/feedback-spine';

interface SessionFeedbackRow {
  id: string;
  institution_id: string | null;
  student_id: string | null;
  timetable_id: string | null;
  course_code: string | null;
  course_name: string | null;
  faculty_email: string | null;
  attendance_date: string | null;
  understood: boolean | null;
  checklist: unknown;
  free_text: string | null;
  created_at: string | null;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('session_feedback')
    .select(
      'id, institution_id, student_id, timetable_id, course_code, course_name, faculty_email, attendance_date, understood, checklist, free_text, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data as SessionFeedbackRow[]) ?? [];
  const events: FeedbackEventInput[] = rows.map((r) => ({
    source: 'session_feedback',
    source_ref: r.id,
    institution_id: r.institution_id,
    actor_type: 'learner',
    actor_ref: r.student_id,
    target_type: 'session',
    target_ref: r.timetable_id ?? r.course_code,
    event_type: 'rating',
    // Only free_text is classifiable; pure understood/checklist rows are numeric.
    content: r.free_text && r.free_text.trim().length > 0 ? r.free_text.trim() : null,
    rating: r.understood === true ? 1 : r.understood === false ? 0 : null,
    raw: {
      course_code: r.course_code,
      course_name: r.course_name,
      faculty_email: r.faculty_email,
      attendance_date: r.attendance_date,
      understood: r.understood,
      checklist: r.checklist,
    },
    occurred_at: r.created_at ?? undefined,
  }));

  const result = await ingestFeedbackEvents(events);
  return NextResponse.json({ success: !result.error, source: 'session_feedback', ...result });
}
