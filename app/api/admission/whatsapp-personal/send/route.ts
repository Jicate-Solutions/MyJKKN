

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';
import { personalSendMessageAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { department_id, to, message, lead_id, recipient_name } = body;

  if (!to || !message) {
    return NextResponse.json({ error: 'to and message required' }, { status: 400 });
  }

  // Support 'any' for super admins or find by department
  let whatsappConnection = (department_id && department_id !== 'any')
    ? await WhatsAppPersonalConnectionService.getConnection(department_id)
    : null;
  if (!whatsappConnection || whatsappConnection.status !== 'ready') {
    whatsappConnection = await WhatsAppPersonalConnectionService.getAnyReadyConnection();
  }
  if (!whatsappConnection || whatsappConnection.status !== 'ready') {
    return NextResponse.json({ error: 'Personal WhatsApp not connected' }, { status: 503 });
  }

  const logEntry = await WhatsAppPersonalMessageService.logMessage({
    department_id: whatsappConnection.department_id,
    connection_id: whatsappConnection.id,
    recipient_type: 'individual',
    recipient_phone: to,
    recipient_name: recipient_name || undefined,
    message_content: message,
    lead_id: lead_id || undefined,
    sent_by: user.id,
    status: 'pending',
  });

  const clientId = whatsappConnection.client_id || `dept-${whatsappConnection.department_id}`;
  const serviceUrl = whatsappConnection.service_url || process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';

  let result: { success: boolean; messageId?: string; error?: string };
  try {
    result = await personalSendMessageAPI(to, message, {
      serviceUrl: `${serviceUrl}/clients/${clientId}`,
      apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
    });
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : 'Send failed' };
  }

  if (logEntry) {
    await WhatsAppPersonalMessageService.updateStatus(
      logEntry.id,
      result.success ? 'sent' : 'failed',
      {
        whatsapp_message_id: result.messageId,
        error_message: result.error,
      }
    );
  }

  return NextResponse.json(result);
}
