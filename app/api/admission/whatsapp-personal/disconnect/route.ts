import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalDisconnectAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const institutionId = body.institution_id;
  if (!institutionId) return NextResponse.json({ error: 'institution_id required' }, { status: 400 });

  try {
    await personalDisconnectAPI();
  } catch {
    // Service may already be down — proceed with DB cleanup
  }

  await WhatsAppPersonalConnectionService.updateStatus(institutionId, 'disconnected');

  return NextResponse.json({ success: true, message: 'Disconnected' });
}
