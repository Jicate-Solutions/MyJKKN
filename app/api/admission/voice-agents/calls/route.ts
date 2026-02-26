// app/api/admission/voice-agents/calls/route.ts
// GET agent call logs

import { NextRequest, NextResponse } from 'next/server';
import { VoiceAgentService } from '@/lib/services/ai/voice-agent-service';
import type { VoiceAgentType, CallStatus, CallOutcome } from '@/lib/services/ai/voice-agent-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const callId = searchParams.get('call_id');

    if (!institutionId && !callId) {
      return NextResponse.json({ error: 'institution_id or call_id is required' }, { status: 400 });
    }

    // Single call detail
    if (callId) {
      const call = await VoiceAgentService.getAgentCall(callId);
      if (!call) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 });
      }
      return NextResponse.json({ call });
    }

    // Call list
    const result = await VoiceAgentService.getAgentCalls({
      institutionId: institutionId!,
      agentType: searchParams.get('agent_type') as VoiceAgentType || undefined,
      agentConfigId: searchParams.get('agent_config_id') || undefined,
      leadId: searchParams.get('lead_id') || undefined,
      callStatus: searchParams.get('call_status') as CallStatus || undefined,
      callOutcome: searchParams.get('call_outcome') as CallOutcome || undefined,
      fromDate: searchParams.get('from_date') || undefined,
      toDate: searchParams.get('to_date') || undefined,
      limit: parseInt(searchParams.get('limit') || '20'),
      offset: parseInt(searchParams.get('offset') || '0'),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/voice-agents/calls] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch call logs' },
      { status: 500 }
    );
  }
}
