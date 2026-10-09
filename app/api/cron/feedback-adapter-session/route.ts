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
  /**
   * THE ROOT CAUSE. This was declared `boolean | null`, but the column is a
   * SMALLINT holding the learner's 1..5 score. The wrong declaration is why the
   * mapping below was written as a true/false comparison and why TypeScript
   * raised no objection, so every score was silently discarded.
   */
  understood: number | null;
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

/** Source rows fetched per page. */
const PAGE = 1000;

/**
 * Keep paging until this much wall time is gone. maxDuration is 300s; the gap
 * absorbs the page in flight so the run reports its tally instead of being
 * killed mid-page.
 *
 * A SINGLE page per run would not converge: source intake is about 2,000 rows a
 * day (215,938 rows over the 105 days to 2026-10-01) and this route is on NO
 * Vercel schedule at all — it runs on demand, roughly daily. One page of 1,000
 * against 2,000 arriving means the pending set grows for ever and today's class
 * feedback waits behind July's. That is the same starvation this file already
 * suffered from the other direction, so the loop is correctness, not throughput.
 */
const TIME_BUDGET_MS = 240_000;

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();
  const startedAt = Date.now();

  let inserted = 0;
  let fetched = 0;
  let pages = 0;
  let stoppedBecause = 'nothing left to copy';

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const { data, error } = await db
      // The view excludes rows already in the spine, so paging OLDEST FIRST
      // converges instead of starving, and each page is genuinely new work.
      // Reading session_feedback directly with created_at DESC re-served the
      // newest 1,000 every run and left 148,748 of 215,938 source rows never
      // ingested at all (measured 2026-10-01). Reading the base table ASC would
      // be the mirror of that bug: the same oldest 1,000 re-served for ever.
      .from('v_session_feedback_pending_ingest')
      .select(
        'id, institution_id, student_id, timetable_id, course_code, course_name, faculty_email, attendance_date, understood, checklist, free_text, created_at'
      )
      .order('created_at', { ascending: true })
      .limit(PAGE);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows = (data as SessionFeedbackRow[]) ?? [];
    if (rows.length === 0) break;

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
      // The learner's 1..5 score, kept as the score. It was compared with
      // === true / === false, which a number never satisfies, so all 67,190
      // ingested rows carried a NULL rating on 2026-10-01 — including the 534
      // who answered 1 or 2 and most needed to be seen. typeof still guards it,
      // because the row shape comes back from the database untyped.
      // Range-checked as well: the form only offers whole numbers 1..5, so anything else is
      // not a score and must not be averaged as one.
      rating:
        Number.isInteger(r.understood) && (r.understood as number) >= 1 && (r.understood as number) <= 5
          ? r.understood
          : null,
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
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error, pages, fetched, inserted },
        { status: 500 },
      );
    }

    pages += 1;
    fetched += rows.length;
    inserted += result.inserted ?? 0;

    // A page that inserted nothing means the view is still handing back rows the
    // ingest will not take. Looping would spin on them, so stop and say so
    // rather than burning the budget in silence.
    if ((result.inserted ?? 0) === 0) {
      stoppedBecause = 'a page inserted nothing — stopping instead of spinning';
      break;
    }

    if (Date.now() - startedAt >= TIME_BUDGET_MS) {
      stoppedBecause = 'time budget spent';
      break;
    }
  }

  return NextResponse.json({
    success: true,
    source: 'session_feedback',
    pages,
    fetched,
    inserted,
    elapsed_ms: Date.now() - startedAt,
    stopped_because: stoppedBecause,
  });
}
