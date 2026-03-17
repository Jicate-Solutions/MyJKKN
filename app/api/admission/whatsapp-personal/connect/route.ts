import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalConnectAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const institutionId = body.institution_id;
  if (!institutionId) return NextResponse.json({ error: 'institution_id required' }, { status: 400 });

  const serviceUrl = process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';

  await WhatsAppPersonalConnectionService.upsertConnection(institutionId, {
    status: 'connecting',
    service_url: serviceUrl,
    connected_by: user.id,
  });

  const result = await personalConnectAPI();

  if (result.success) {
    await WhatsAppPersonalConnectionService.updateStatus(institutionId, result.status, {
      connected_by: user.id,
    });
  }

  return NextResponse.json(result);
}
