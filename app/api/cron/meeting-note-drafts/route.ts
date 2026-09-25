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
//   2. ENQUEUE new drafts — only for notes that are LINKED to a booking, still
//      have no summary, were never drafted, are at least 2 hours old, and are
//      NOT interviews. At most 10 per run.
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
import { collectJobsLane, enqueueJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import { fetchFirefliesTranscriptSentences } from '@/lib/services/meetings/fireflies-client';
import {
  NOTE_DRAFT_JOB,
  runCollect,
  runEnqueue,
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

  // ── 1) COLLECT first, so a note drafted last run is stamped before step 2
  //       could consider it again.
  let collect: Awaited<ReturnType<typeof runCollect>> | { error: string };
  try {
    collect = await runCollect(db, () => collectJobsLane(admin, [NOTE_DRAFT_JOB], COLLECT_BATCH));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[meeting-note-drafts] collect phase failed:', message);
    collect = { error: message };
  }

  // ── 2) ENQUEUE ──────────────────────────────────────────────────────────────
  let enqueue: Awaited<ReturnType<typeof runEnqueue>> | { error: string };
  try {
    enqueue = await runEnqueue(db, {
      fetchSentences: fetchFirefliesTranscriptSentences,
      enqueue: (args) => enqueueJobsLane(admin, args),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[meeting-note-drafts] enqueue phase failed:', message);
    enqueue = { error: message };
  }

  // Flat numeric counters: the dispatcher's summarizeRoutineResult only reads
  // top-level numbers into ai_routine_schedules.last_status.
  const c = 'error' in collect ? null : collect;
  const q = 'error' in enqueue ? null : enqueue;
  return NextResponse.json({
    ok: true,
    dark: q?.dark ?? null,
    collected: c?.collected ?? 0,
    recorded: c?.recorded ?? 0,
    itemsSkipped: c?.itemsSkipped ?? 0,
    unreadable: c?.unreadable ?? 0,
    noHost: c?.noHost ?? 0,
    promptsStripped: c?.stripped ?? 0,
    considered: q?.considered ?? 0,
    excludedInterviews: q?.excludedInterviews ?? 0,
    enqueued: q?.enqueued ?? 0,
    inFlight: q?.inFlight ?? 0,
    noTranscript: q?.noTranscript ?? 0,
    skipped: (c?.skipped ?? 0) + (q?.skipped ?? 0),
    errors: (c?.errors ?? 0) + (c ? 0 : 1) + (q ? 0 : 1),
    stoppedReason: 'error' in enqueue ? enqueue.error : (q?.stoppedReason ?? null),
    collectError: 'error' in collect ? collect.error : null,
  });
}
