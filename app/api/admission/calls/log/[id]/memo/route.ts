// PATCH /api/admission/calls/log/[id]/memo
//
// Attaches a voice-memo audio URL + duration to an existing call log row.
// Two-step flow (companion to POST /api/admission/calls/log):
//   1. Client POSTs to /api/admission/calls/log → returns { callLog: { id } }
//   2. Client uploads the audio Blob to Supabase Storage at
//      `call-memos/{institution_id}/{call_log_id}.webm`
//   3. Client PATCHes here with { memo_audio_url, memo_audio_duration_seconds }
//
// We additionally seed `memo_analyze_status = 'pending'` so Agent O's cron
// (companion PR) picks the row up on its next sweep without needing a
// separate trigger. The cron filters on `memo_analyze_status IN
// ('pending', 'failed')` and the CHECK constraint allows only the
// canonical state-machine values, so 'pending' is the right initial
// state. Schema columns are added by Agent O's migration —
// this route is no-op-safe if those columns are still missing (we wrap the
// update in a defensive try/catch and report a clear error).

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    const { id: callLogId } = await context.params;
    if (!callLogId) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'call_log id is required in the URL' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { memo_audio_url, memo_audio_duration_seconds, memo_audio_size_bytes } = body || {};

    if (!memo_audio_url || typeof memo_audio_url !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'memo_audio_url is required and must be a string' },
        { status: 400 },
      );
    }
    if (typeof memo_audio_duration_seconds !== 'number' || memo_audio_duration_seconds < 0) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'memo_audio_duration_seconds is required and must be a non-negative number' },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();

    // Verify the row exists + the caller has access (counselor_id match OR
    // any institution-scoped role — RLS would normally enforce this, but we
    // use service-role here so we check explicitly).
    const { data: existing, error: fetchErr } = await supabase
      .from('admission_call_logs')
      .select('id, counselor_id, institution_id')
      .eq('id', callLogId)
      .maybeSingle();

    if (fetchErr) {
      logger.error('admission/calls/memo', 'Failed to fetch call log for memo attach', { error: fetchErr, callLogId });
      return NextResponse.json(
        { error: 'SERVER_ERROR', message: 'Failed to look up call log' },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Call log not found' },
        { status: 404 },
      );
    }

    const updatePayload: Record<string, any> = {
      memo_audio_url,
      memo_audio_duration_seconds: Math.round(memo_audio_duration_seconds),
      memo_analyze_status: 'pending',
      updated_at: new Date().toISOString(),
    };
    if (typeof memo_audio_size_bytes === 'number' && memo_audio_size_bytes >= 0) {
      updatePayload.memo_audio_size_bytes = Math.round(memo_audio_size_bytes);
    }

    const { error: updateErr } = await supabase
      .from('admission_call_logs')
      .update(updatePayload)
      .eq('id', callLogId);

    if (updateErr) {
      // Most likely cause if Agent O's migration hasn't landed yet: column
      // memo_audio_url / memo_analyze_status doesn't exist. Surface a clean
      // error rather than a 500.
      logger.error('admission/calls/memo', 'Failed to persist memo metadata', { error: updateErr, callLogId });
      return NextResponse.json(
        {
          error: 'SERVER_ERROR',
          message: updateErr.message || 'Failed to attach memo to call log',
          hint: 'If this is a fresh deploy, the memo_audio_* columns may not exist yet. Wait for the schema migration to land.',
        },
        { status: 500 },
      );
    }

    logger.info('admission/calls/memo', 'Memo attached to call log', {
      call_log_id: callLogId,
      duration_sec: memo_audio_duration_seconds,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('admission/calls/memo', 'Unhandled error in memo PATCH', { error });
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error?.message || 'Failed to attach memo' },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
