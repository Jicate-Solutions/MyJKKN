// =====================================================================
// Meetings — AI note-drafter (₹0 Max lane, SHIPS SWITCHED OFF)
// =====================================================================
// When Fireflies returns no summary for a meeting linked to a MyJKKN booking
// (76% of recent meetings, measured 2026-09-26), draft one: a short summary,
// the decisions, and the follow-ups — every output labelled "AI draft".
//
//   1. COLLECT finished drafts, validate every field, record them, then STRIP
//      payload.prompt off the ai_jobs row (a prompt here is a meeting
//      transcript, and it has no further use once the job is delivered).
//      If Fireflies' own summary has arrived by then, the draft is dropped
//      (no tasks) and the note stamped 'summary_arrived'.
//      Then SWEEP this job type's other prompts: jobs that ended 'error' or
//      'canceled' lose theirs, and a job still pending after 7 days is
//      cancelled and loses its prompt too. The sweep runs even if collecting
//      failed.
//   2. ENQUEUE new drafts — only for notes that are LINKED to a booking, still
//      have no summary, were never drafted, are at least 2 hours old, and are
//      NOT interviews. At most 10 per run. SKIPPED for this run when step 1's
//      collect throws: a note whose finished job was not collected must not be
//      sent to the model a second time. A Fireflies code about ONE transcript
//      (object_not_found / forbidden / not_in_team) stamps that note and the
//      run goes on. ONLY a key / account failure (no key, 401, 429,
//      auth_failed, too_many_requests, account_cancelled, paid_required)
//      stops the run; any other Fireflies failure (timeout, network, 5xx,
//      unknown code) skips that one note, unstamped, and the run goes on.
//
// THE SWITCH (ai_job_types 'meetings.note_draft', ships enabled=false) is read
// BEFORE step 1. While it is off the run collects nothing, calls Fireflies for
// nothing and enqueues nothing; it CANCELS every still-pending job of this
// type and removes its prompt, and answers disabled:true with those counts.
// Jobs the drain already claimed or is running cannot be stopped from here;
// their results are collected only if the switch is turned back on. The
// ai_routine_schedules row also ships enabled=false.
//
// A run that stops early answers ok:false with the reason, so the
// dispatcher's last_status shows WHY (see noteDraftRouteBody).
//
// Sends NOTHING to anyone: no notification, email or invite. Writes only
// meeting_notes.ai_draft / ai_drafted_at, meeting_action_items rows with
// source='ai_draft', and ai_jobs. Never writes meeting_notes.summary.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude directly — the external Max-lane drain runs the model.
// Dispatch: the AI-routine dispatcher (ai_routine_schedules row
// 'meeting-note-drafts'), NOT a raw vercel.json cron.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import { fetchFirefliesTranscriptSentences } from '@/lib/services/meetings/fireflies-client';
import {
  collectNoteDraftJobs,
  noteDraftRouteBody,
  runNoteDraftCron,
  supabaseNoteDraftDb,
} from '@/lib/services/meetings/meeting-note-draft';

const COLLECT_BATCH = 25;

function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !bearerMatches(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const db = supabaseNoteDraftDb(admin);

  const run = await runNoteDraftCron(db, {
    // Throws on an RPC error (collectJobsLane would return [] and let the
    // enqueue pass re-send a note whose finished job was never collected).
    collect: () => collectNoteDraftJobs(admin, COLLECT_BATCH),
    fetchSentences: fetchFirefliesTranscriptSentences,
    enqueue: (args) => enqueueJobsLane(admin, args),
  });

  if (run.switchError) console.error('[meeting-note-drafts] could not read the switch:', run.switchError);
  if (run.collectError) console.error('[meeting-note-drafts] collect phase failed:', run.collectError);
  if (run.sweepError) console.error('[meeting-note-drafts] prompt sweep failed:', run.sweepError);
  if (run.enqueueError) console.error('[meeting-note-drafts] enqueue phase failed:', run.enqueueError);

  // Flat counters, and ok:false + `error` for any run that stopped early —
  // the dispatcher's summarizeRoutineResult prints that sentence into
  // ai_routine_schedules.last_status instead of the numbers.
  return NextResponse.json(noteDraftRouteBody(run));
}
