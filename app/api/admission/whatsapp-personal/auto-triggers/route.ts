// app/api/admission/whatsapp-personal/auto-triggers/route.ts
// CRUD API for WhatsApp auto-trigger rules

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { WhatsAppPersonalAutoTriggerService } from '@/lib/services/whatsapp/whatsapp-personal-auto-trigger-service';

export async function GET(request: NextRequest) {
  await connection();
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const institutionId = request.nextUrl.searchParams.get('institution_id');
  if (!institutionId) {
    return NextResponse.json({ error: 'institution_id required' }, { status: 400 });
  }

  const rules = await WhatsAppPersonalAutoTriggerService.getRules(institutionId);
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  await connection();
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { institution_id, name, event_type, conditions, channel_priority, template_id, delay_seconds, daily_limit } = body;

  if (!institution_id || !name || !event_type) {
    return NextResponse.json(
      { error: 'institution_id, name, and event_type are required' },
      { status: 400 }
    );
  }

  const rule = await WhatsAppPersonalAutoTriggerService.createRule(
    { institution_id, name, event_type, conditions, channel_priority, template_id, delay_seconds, daily_limit },
    user.id
  );

  if (!rule) {
    return NextResponse.json({ error: 'Failed to create trigger rule' }, { status: 500 });
  }
  return NextResponse.json({ rule }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  await connection();
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await request.json();
  const rule = await WhatsAppPersonalAutoTriggerService.updateRule(id, body);

  if (!rule) {
    return NextResponse.json({ error: 'Failed to update trigger rule' }, { status: 500 });
  }
  return NextResponse.json({ rule });
}

export async function DELETE(request: NextRequest) {
  await connection();
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const success = await WhatsAppPersonalAutoTriggerService.deleteRule(id);
  return NextResponse.json({ success });
}
