import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { institution_id, to, media_url, caption, media_type, lead_id, recipient_name } = body;

  if (!institution_id || !to || !media_url) {
    return NextResponse.json({ error: 'institution_id, to, and media_url required' }, { status: 400 });
  }

  // Find connection (with multi-institution fallback)
  let connection = await WhatsAppPersonalConnectionService.getConnection(institution_id);
  if (!connection || connection.status !== 'ready') {
    connection = await WhatsAppPersonalConnectionService.getAnyReadyConnection();
  }
  if (!connection || connection.status !== 'ready') {
    return NextResponse.json({ error: 'Personal WhatsApp not connected' }, { status: 503 });
  }

  // Log the message
  const logEntry = await WhatsAppPersonalMessageService.logMessage({
    institution_id,
    connection_id: connection.id,
    recipient_type: 'individual',
    recipient_phone: to,
    recipient_name: recipient_name || undefined,
    message_content: caption || `[${media_type || 'media'}]`,
    lead_id: lead_id || undefined,
    sent_by: user.id,
    status: 'pending',
  });

  // Send media via Railway service
  const serviceUrl = connection.service_url || process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';
  const apiKey = process.env.WHATSAPP_PERSONAL_API_KEY || '';

  let result: { success: boolean; messageId?: string; error?: string };
  try {
    const res = await fetch(`${serviceUrl}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        to,
        mediaUrl: media_url,
        caption: caption || undefined,
        mediaType: media_type || 'image',
      }),
    });

    result = await res.json();
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : 'Send media failed' };
  }

  // Update log
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
