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
//      Then SWEEP this job type's other prompts: jobs that ended 'error' or
//      'canceled' lose theirs, and a job still pending after 7 days is
//      cancelled and loses its prompt too. The sweep runs even if collecting
//      failed.
//   2. ENQUEUE new drafts — only for notes that are LINKED to a booking, still
//      have no summary, were never drafted, are at least 2 hours old, and are
//      NOT interviews. At most 10 per run. SKIPPED for this run when step 1's
//      collect throws: a note whose finished job was not collected must not be
//      sent to the model a second time.
//
// SWITCHED OFF twice over: the ai_job_types row 'meetings.note_draft' ships
// enabled=false (the enqueue phase returns before any Fireflies call or DB
// write while it is), and the ai_routine_schedules row ships enabled=false.
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

  if (run.collectError) console.error('[meeting-note-drafts] collect phase failed:', run.collectError);
  if (run.sweepError) console.error('[meeting-note-drafts] prompt sweep failed:', run.sweepError);
  if (run.enqueueError) console.error('[meeting-note-drafts] enqueue phase failed:', run.enqueueError);

  const c = run.collect;
  const w = run.sweep;
  const q = run.enqueue;
  const counters = {
    dark: q?.dark ?? null,
    collected: c?.collected ?? 0,
    recorded: c?.recorded ?? 0,
    itemsSkipped: c?.itemsSkipped ?? 0,
    unreadable: c?.unreadable ?? 0,
    noHost: c?.noHost ?? 0,
    promptsStripped: c?.stripped ?? 0,
    promptsRetired: w?.stripped ?? 0,
    stalePendingCanceled: w?.canceled ?? 0,
    considered: q?.considered ?? 0,
    excludedInterviews: q?.excludedInterviews ?? 0,
    enqueued: q?.enqueued ?? 0,
    inFlight: q?.inFlight ?? 0,
    noTranscript: q?.noTranscript ?? 0,
    transcriptRetry: q?.transcriptRetry ?? 0,
    skipped: (c?.skipped ?? 0) + (q?.skipped ?? 0),
    errors:
      (c?.errors ?? 0) +
      (w?.errors ?? 0) +
      (run.collectError ? 1 : 0) +
      (run.sweepError ? 1 : 0) +
      (run.enqueueError ? 1 : 0),
    enqueueSkipped: run.enqueueSkipped,
    stoppedReason: run.enqueueError ?? q?.stoppedReason ?? null,
    collectError: run.collectError,
    sweepError: run.sweepError,
  };

  // Flat numeric counters: the dispatcher's summarizeRoutineResult reads
  // top-level numbers into ai_routine_schedules.last_status — and, when
  // ok=false with an `error` string, prints that sentence instead, which is
  // how a skipped enqueue reaches the status line.
  if (run.enqueueSkipped) {
    return NextResponse.json({
      ok: false,
      error: `collect failed, enqueue skipped this run: ${run.collectError}`,
      ...counters,
    });
  }
  return NextResponse.json({ ok: true, ...counters });
}
