// app/api/admission/voice-agents/route.ts
// CRUD API for AI voice agent configs

import { NextRequest, NextResponse } from 'next/server';
import { VoiceAgentService } from '@/lib/services/ai/voice-agent-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const view = searchParams.get('view'); // 'analytics'

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    if (view === 'analytics') {
      const analytics = await VoiceAgentService.getAnalytics({
        institutionId,
        fromDate: searchParams.get('from_date') || undefined,
        toDate: searchParams.get('to_date') || undefined,
      });
      return NextResponse.json(analytics);
    }

    const configs = await VoiceAgentService.getAgentConfigs(institutionId);
    return NextResponse.json({
      configs,
      agentTypes: VoiceAgentService.getAgentTypes(),
    });
  } catch (error) {
    console.error('[api/voice-agents] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch voice agent configs' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'initialize') {
      const configs = await VoiceAgentService.initializeDefaultConfigs(body.institution_id);
      return NextResponse.json({ configs });
    }

    if (body.action === 'initiate_call') {
      const call = await VoiceAgentService.initiateCall({
        agentConfigId: body.agent_config_id,
        leadId: body.lead_id,
        phoneNumber: body.phone_number,
        institutionId: body.institution_id,
        metadata: body.metadata,
      });
      return NextResponse.json({ call });
    }

    // Create new config
    const config = await VoiceAgentService.createAgentConfig(body);
    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    console.error('[api/voice-agents] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process voice agent request' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const config = await VoiceAgentService.updateAgentConfig(id, updateData);
    return NextResponse.json({ config });
  } catch (error) {
    console.error('[api/voice-agents] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update voice agent config' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await VoiceAgentService.deleteAgentConfig(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/voice-agents] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete voice agent config' },
      { status: 500 }
    );
  }
}
