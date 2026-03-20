// app/api/admission/alerts/route.ts
// CRUD API for activity alert rules

import { NextRequest, NextResponse } from 'next/server';
import { ActivityAlertService } from '@/lib/services/admission/activity-alert-service';
import type { AlertEventType } from '@/lib/services/admission/activity-alert-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const eventType = searchParams.get('event_type') as AlertEventType | null;
    const isEnabled = searchParams.get('is_enabled');
    const view = searchParams.get('view'); // 'history' for alert history

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    if (view === 'history') {
      const history = await ActivityAlertService.getAlertHistory({
        institutionId,
        eventType: eventType || undefined,
        leadId: searchParams.get('lead_id') || undefined,
        fromDate: searchParams.get('from_date') || undefined,
        toDate: searchParams.get('to_date') || undefined,
        limit: parseInt(searchParams.get('limit') || '50'),
        offset: parseInt(searchParams.get('offset') || '0'),
      });
      return NextResponse.json(history);
    }

    const rules = await ActivityAlertService.getAlertRules({
      institutionId,
      eventType: eventType || undefined,
      isEnabled: isEnabled !== null ? isEnabled === 'true' : undefined,
    });

    return NextResponse.json({ rules, eventTypes: ActivityAlertService.getEventTypes() });
  } catch (error) {
    console.error('[api/alerts] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch alert rules' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'initialize') {
      const rules = await ActivityAlertService.initializeDefaultRules(body.institution_id);
      return NextResponse.json({ rules });
    }

    if (body.action === 'toggle') {
      const rule = await ActivityAlertService.toggleAlertRule(body.id, body.is_enabled);
      return NextResponse.json({ rule });
    }

    if (body.action === 'process_event') {
      const result = await ActivityAlertService.processEvent({
        institutionId: body.institution_id,
        eventType: body.event_type,
        leadId: body.lead_id,
        leadName: body.lead_name,
        counselorId: body.counselor_id,
        metadata: body.metadata,
      });
      return NextResponse.json(result);
    }

    // Create new rule
    const rule = await ActivityAlertService.createAlertRule(body);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error('[api/alerts] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create alert rule' },
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

    const rule = await ActivityAlertService.updateAlertRule(id, updateData);
    return NextResponse.json({ rule });
  } catch (error) {
    console.error('[api/alerts] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update alert rule' },
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

    await ActivityAlertService.deleteAlertRule(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/alerts] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete alert rule' },
      { status: 500 }
    );
  }
}
