import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CallPipelineService } from '@/lib/services/telephony/call-pipeline-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch call log
  const { data: call, error } = await supabase
    .from('admission_call_logs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  }

  if (!call.recording_url) {
    return NextResponse.json({ error: 'No recording available for analysis' }, { status: 400 });
  }

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

  return NextResponse.json({ result });
}
