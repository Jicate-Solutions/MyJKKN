// app/api/admission/costs/route.ts
// GET communication cost data

import { NextRequest, NextResponse } from 'next/server';
import { CommunicationCostService } from '@/lib/services/admission/communication-cost-service';
import type { CostChannel, CostEventType } from '@/lib/services/admission/communication-cost-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const view = searchParams.get('view'); // 'dashboard' | 'monthly' | 'channels' | default (entries)

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    if (view === 'dashboard') {
      const dashboard = await CommunicationCostService.getDashboard(institutionId);
      return NextResponse.json(dashboard);
    }

    if (view === 'monthly') {
      const months = parseInt(searchParams.get('months') || '12');
      const summary = await CommunicationCostService.getMonthlySummary({
        institutionId,
        months,
      });
      return NextResponse.json({ monthly: summary });
    }

    if (view === 'channels') {
      const breakdown = await CommunicationCostService.getChannelBreakdown({
        institutionId,
        fromDate: searchParams.get('from_date') || undefined,
        toDate: searchParams.get('to_date') || undefined,
      });
      return NextResponse.json({ channels: breakdown });
    }

    // Default: cost entries
    const result = await CommunicationCostService.getCosts({
      institutionId,
      channel: searchParams.get('channel') as CostChannel || undefined,
      eventType: searchParams.get('event_type') as CostEventType || undefined,
      fromDate: searchParams.get('from_date') || undefined,
      toDate: searchParams.get('to_date') || undefined,
      limit: parseInt(searchParams.get('limit') || '50'),
      offset: parseInt(searchParams.get('offset') || '0'),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/costs] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch cost data' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const entry = await CommunicationCostService.logCost({
      institution_id: body.institution_id,
      channel: body.channel,
      event_type: body.event_type,
      unit_cost: body.unit_cost,
      quantity: body.quantity,
      currency: body.currency,
      reference_id: body.reference_id,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('[api/costs] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to log cost' },
      { status: 500 }
    );
  }
}
