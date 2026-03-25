// app/api/admission/voice-broadcast/route.ts
// CRUD API for voice broadcast campaigns

import { NextRequest, NextResponse } from 'next/server';
import { VoiceBroadcastService } from '@/lib/services/telephony/voice-broadcast-service';
import type { BroadcastStatus } from '@/lib/services/telephony/voice-broadcast-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const campaignId = searchParams.get('campaign_id');
    const view = searchParams.get('view'); // 'stats' | 'logs'

    if (!institutionId && !campaignId) {
      return NextResponse.json({ error: 'institution_id or campaign_id is required' }, { status: 400 });
    }

    if (view === 'stats' && institutionId) {
      const stats = await VoiceBroadcastService.getStats(institutionId);
      return NextResponse.json(stats);
    }

    if (view === 'logs' && campaignId) {
      const result = await VoiceBroadcastService.getCampaignLogs({
        campaignId,
        callStatus: searchParams.get('call_status') as any || undefined,
        pressed1: searchParams.get('pressed_1') !== null ? searchParams.get('pressed_1') === 'true' : undefined,
        limit: parseInt(searchParams.get('limit') || '50'),
        offset: parseInt(searchParams.get('offset') || '0'),
      });
      return NextResponse.json(result);
    }

    if (campaignId) {
      const campaign = await VoiceBroadcastService.getCampaign(campaignId);
      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
      return NextResponse.json({ campaign });
    }

    // Campaign list
    const result = await VoiceBroadcastService.getCampaigns({
      institutionId: institutionId!,
      status: searchParams.get('status') as BroadcastStatus || undefined,
      fromDate: searchParams.get('from_date') || undefined,
      toDate: searchParams.get('to_date') || undefined,
      limit: parseInt(searchParams.get('limit') || '20'),
      offset: parseInt(searchParams.get('offset') || '0'),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/voice-broadcast] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch broadcast campaigns' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'start') {
      const campaign = await VoiceBroadcastService.startCampaign(body.campaign_id);
      return NextResponse.json({ campaign });
    }

    if (body.action === 'pause') {
      const campaign = await VoiceBroadcastService.pauseCampaign(body.campaign_id);
      return NextResponse.json({ campaign });
    }

    if (body.action === 'cancel') {
      const campaign = await VoiceBroadcastService.cancelCampaign(body.campaign_id);
      return NextResponse.json({ campaign });
    }

    if (body.action === 'estimate_audience') {
      const size = await VoiceBroadcastService.estimateAudienceSize(
        body.institution_id,
        body.audience_filter
      );
      return NextResponse.json({ audience_size: size });
    }

    // Create new campaign
    const campaign = await VoiceBroadcastService.createCampaign(body);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error('[api/voice-broadcast] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process broadcast request' },
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

    const campaign = await VoiceBroadcastService.updateCampaign(id, updateData);
    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('[api/voice-broadcast] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update broadcast campaign' },
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

    await VoiceBroadcastService.deleteCampaign(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/voice-broadcast] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete broadcast campaign' },
      { status: 500 }
    );
  }
}
