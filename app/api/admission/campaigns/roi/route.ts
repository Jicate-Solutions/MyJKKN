// app/api/admission/campaigns/roi/route.ts
// GET ROI data for campaigns

import { NextRequest, NextResponse } from 'next/server';
import { CampaignROIService } from '@/lib/services/admission/campaign-roi-service';
import type { AttributionChannel } from '@/lib/services/admission/campaign-roi-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const view = searchParams.get('view'); // 'summary' | 'channels' | 'funnel' | default (campaigns)
    const channel = searchParams.get('channel') as AttributionChannel | null;
    const campaignId = searchParams.get('campaign_id');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');

    if (!institutionId && view !== 'funnel') {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    if (view === 'summary') {
      const summary = await CampaignROIService.getROISummary({
        institutionId: institutionId!,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      return NextResponse.json(summary);
    }

    if (view === 'channels') {
      const comparison = await CampaignROIService.getChannelComparison({
        institutionId: institutionId!,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      return NextResponse.json({ channels: comparison });
    }

    if (view === 'funnel' && campaignId) {
      const funnel = await CampaignROIService.getConversionFunnel(campaignId);
      return NextResponse.json({ funnel });
    }

    // Default: campaign list with ROI data
    const result = await CampaignROIService.getCampaignROI({
      institutionId: institutionId!,
      channel: channel || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      campaignId: campaignId || undefined,
      limit: parseInt(searchParams.get('limit') || '20'),
      offset: parseInt(searchParams.get('offset') || '0'),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/campaigns/roi] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaign ROI' },
      { status: 500 }
    );
  }
}
