

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalDisconnectAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const departmentId = body.department_id;
  if (!departmentId) return NextResponse.json({ error: 'department_id required' }, { status: 400 });

  const whatsappConnection = await WhatsAppPersonalConnectionService.getConnection(departmentId);
  const clientId = whatsappConnection?.client_id || `dept-${departmentId}`;
  const serviceUrl = whatsappConnection?.service_url || process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';

  try {
    await personalDisconnectAPI({
      serviceUrl: `${serviceUrl}/clients/${clientId}`,
      apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
    });
  } catch {
    // Service may already be down — proceed with DB cleanup
  }

  await WhatsAppPersonalConnectionService.updateStatus(departmentId, 'disconnected');

  return NextResponse.json({ success: true, message: 'Disconnected' });
}
