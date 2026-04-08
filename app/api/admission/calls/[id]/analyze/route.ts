

// app/api/admission/calls/[id]/analyze/route.ts
// POST /api/admission/calls/[id]/analyze — Run call intelligence pipeline

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { CallPipelineService } from '@/lib/services/telephony/call-pipeline-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Call ID is required' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Fetch call log
    const { data: call, error } = await supabase
      .from('admission_call_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !call) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Call not found' },
        { status: 404 }
      );
    }

    if (!call.recording_url) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'No recording available for analysis' },
        { status: 400 }
      );
    }

    logger.info('admission/calls', 'Running call analysis pipeline', {
      callId: id,
      userId: user.id,
    });

    // Run pipeline
    const result = await CallPipelineService.runPipeline({
      callLogId: call.id,
      callSid: call.call_sid,
      institutionId: call.institution_id,
      direction: call.direction,
      status: call.status,
      fromNumber: call.from_number,
      toNumber: call.to_number,
      durationSeconds: call.duration_seconds ?? 0,
      costAmount: call.cost_amount ?? 0,
      recordingUrl: call.recording_url,
      leadId: call.lead_id ?? undefined,
      counselorId: call.counselor_id ?? undefined,
    }, supabase);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('admission/calls', 'Call analysis pipeline error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
