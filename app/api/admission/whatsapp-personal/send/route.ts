import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';
import { personalSendMessageAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { institution_id, to, message, lead_id, recipient_name } = body;

  if (!institution_id || !to || !message) {
    return NextResponse.json({ error: 'institution_id, to, and message required' }, { status: 400 });
  }

  // Try to find connection for the given institution, or fall back to any ready connection
  let connection = await WhatsAppPersonalConnectionService.getConnection(institution_id);
  if (!connection || connection.status !== 'ready') {
    // User may have access to multiple institutions — find any ready connection
    connection = await WhatsAppPersonalConnectionService.getAnyReadyConnection();
  }
  if (!connection || connection.status !== 'ready') {
    return NextResponse.json({ error: 'Personal WhatsApp not connected' }, { status: 503 });
  }

  const logEntry = await WhatsAppPersonalMessageService.logMessage({
    institution_id,
    connection_id: connection.id,
    recipient_type: 'individual',
    recipient_phone: to,
    recipient_name: recipient_name || undefined,
    message_content: message,
    lead_id: lead_id || undefined,
    sent_by: user.id,
    status: 'pending',
  });

  let result: { success: boolean; messageId?: string; error?: string };
  try {
    result = await personalSendMessageAPI(to, message);
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
