// =====================================================================
// Call Analysis Pipeline Sweeper — every 15 min
// =====================================================================
// Wires the existing `CallPipelineService.runPipeline()` substrate to
// fresh `admission_call_logs` rows that have not yet had AI analysis
// (transcription / sentiment / summary / category) populated.
//
// EMPIRICAL CONTEXT (2026-05-08):
//  - 3,229 admission calls exist in `admission_call_logs`.
//  - 0 of 3,229 have an `admission_call_intelligence` row with
//    `analyze_status='completed'`.
//  - The pipeline (POST /api/admission/calls/[id]/analyze +
//    CallPipelineService) was built but never triggered automatically —
//    no cron, no webhook hook. This file is that missing trigger.
//
// LOGIC:
//  1. SELECT call_logs created in last 7 days where:
//       - has a recording_url (analysis is impossible without audio)
//       - AND (no intelligence_id) OR (intelligence row has analyze_status
//         IN ('pending','failed'))
//  2. LIMIT 50 per run (rate-limit guard against ExoVoiceAnalyze).
//  3. For each, call `CallPipelineService.runPipeline()` — the same path
//    POST /analyze uses. The service is idempotent (skips calls that
//    already have an intelligence_id).
//  4. Return processed/succeeded/failed/remaining counts.
//
// Backfill of historical 3,229 calls is OUT OF SCOPE for this cron —
// see docs/admission/call-analysis-pipeline.md for the manual SQL hint.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query.
// Required env: CRON_SECRET.
// Schedule: */15 * * * * (every 15 min).
//
// Created: 2026-05-08 — Director Pulse "lead mood daily" enabler.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CallPipelineService } from '@/lib/services/telephony/call-pipeline-service';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 50;

interface CallLogRow {
  id: string;
  call_sid: string;
  institution_id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  from_number: string;
  to_number: string;
  duration_seconds: number | null;
  cost_amount: number | null;
  recording_url: string | null;
  lead_id: string | null;
  counselor_id: string | null;
  intelligence_id: string | null;
}

export async function GET(request: NextRequest) {
  const started = Date.now();

  // --- Auth ---------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const sinceIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  // --- Find candidates ---------------------------------------------
  // Strategy: split into two passes for clarity.
  // Pass 1: call_logs with intelligence_id IS NULL (never submitted).
  // Pass 2: call_logs whose intelligence row is pending/failed (needs retry).
  // Both are then capped to BATCH_LIMIT total. Recording_url is required —
  // CallPipelineService.submitForAnalysis() needs audio.

  const candidates: CallLogRow[] = [];

  // Pass 1: never-submitted calls (intelligence_id IS NULL).
  try {
    const { data, error } = await supabase
      .from('admission_call_logs')
      .select(
        'id, call_sid, institution_id, direction, status, from_number, to_number, duration_seconds, cost_amount, recording_url, lead_id, counselor_id, intelligence_id'
      )
      .is('intelligence_id', null)
      .not('recording_url', 'is', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (error) throw error;
    if (data) candidates.push(...(data as CallLogRow[]));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron/analyze-calls] Pass 1 (unsubmitted) query failed:', msg);
  }

  // Pass 2: previously-failed/pending intelligence rows — retry them.
  // Only fetch up to remaining budget after Pass 1.
  const remainingBudget = BATCH_LIMIT - candidates.length;
  if (remainingBudget > 0) {
    try {
      const { data: pendingIntel, error: intelErr } = await supabase
        .from('admission_call_intelligence')
        .select('call_log_id')
        .in('analyze_status', ['pending', 'failed'])
        .gte('created_at', sinceIso)
        .limit(remainingBudget);
      if (intelErr) throw intelErr;

      const pendingCallLogIds = (pendingIntel ?? [])
        .map((r) => (r as { call_log_id: string | null }).call_log_id)
        .filter((id): id is string => !!id);

      if (pendingCallLogIds.length > 0) {
        const { data: retryRows, error: retryErr } = await supabase
          .from('admission_call_logs')
          .select(
            'id, call_sid, institution_id, direction, status, from_number, to_number, duration_seconds, cost_amount, recording_url, lead_id, counselor_id, intelligence_id'
          )
          .in('id', pendingCallLogIds)
          .not('recording_url', 'is', null);
        if (retryErr) throw retryErr;
        if (retryRows) {
          // Dedupe against Pass 1 (defensive — Pass 1 filters intelligence_id IS NULL
          // so overlap should be empty, but cheap to guard against).
          const seen = new Set(candidates.map((c) => c.id));
          for (const row of retryRows as CallLogRow[]) {
            if (!seen.has(row.id)) candidates.push(row);
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron/analyze-calls] Pass 2 (retry) query failed:', msg);
    }
  }

  // --- Process -----------------------------------------------------
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const call of candidates) {
    try {
      const result = await CallPipelineService.runPipeline(
        {
          callLogId: call.id,
          callSid: call.call_sid,
          institutionId: call.institution_id,
          direction: call.direction,
          status: call.status,
          fromNumber: call.from_number,
          toNumber: call.to_number,
          durationSeconds: call.duration_seconds ?? 0,
          costAmount: call.cost_amount ?? 0,
          recordingUrl: call.recording_url ?? undefined,
          leadId: call.lead_id ?? undefined,
          counselorId: call.counselor_id ?? undefined,
        },
        supabase
      );
      if (result.error) {
        failed++;
        errors.push(`${call.id}: ${result.error}`);
      } else {
        succeeded++;
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${call.id}: ${msg}`);
    }
  }

  // --- Remaining-unanalyzed counter (visibility for Director) -------
  // Approximate count of call_logs in last 7 days with recording but no
  // intelligence_id. Uses head:true + count:'exact' for a cheap COUNT(*).
  let remainingUnanalyzed: number | null = null;
  try {
    const { count, error } = await supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .is('intelligence_id', null)
      .not('recording_url', 'is', null)
      .gte('created_at', sinceIso);
    if (error) throw error;
    remainingUnanalyzed = count ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[cron/analyze-calls] remaining count failed:', msg);
  }

  const durationMs = Date.now() - started;
  const processed = candidates.length;

  // Structured log line — peers in app/api/cron/* use console.warn for
  // freshness-gate visibility.
  console.warn(
    '[cron/analyze-calls] run-complete',
    JSON.stringify({
      ok: true,
      duration_ms: durationMs,
      processed,
      succeeded,
      failed,
      remaining_unanalyzed: remainingUnanalyzed,
      first_errors: errors.slice(0, 5),
    })
  );

  return NextResponse.json({
    ok: true,
    duration_ms: durationMs,
    processed,
    succeeded,
    failed,
    remaining_unanalyzed: remainingUnanalyzed,
    errors: errors.slice(0, 10),
  });
}
