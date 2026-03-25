import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';
import { personalSendBulkAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { department_id, recipients, delay_ms } = body;

  if (!department_id || !recipients?.length) {
    return NextResponse.json({ error: 'department_id and recipients required' }, { status: 400 });
  }

  let whatsappConnection = await WhatsAppPersonalConnectionService.getConnection(department_id);
  if (!whatsappConnection || whatsappConnection.status !== 'ready') {
    whatsappConnection = await WhatsAppPersonalConnectionService.getAnyReadyConnection();
  }
  if (!whatsappConnection || whatsappConnection.status !== 'ready') {
    return NextResponse.json({ error: 'Personal WhatsApp not connected' }, { status: 503 });
  }

  const clientId = whatsappConnection.client_id || `dept-${whatsappConnection.department_id}`;
  const serviceUrl = whatsappConnection.service_url || process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';

  let result: { success: boolean; results?: { phone: string; success: boolean; error?: string }[]; totalSent?: number; successCount?: number; failCount?: number };
  try {
    result = await personalSendBulkAPI(recipients, delay_ms || 1500, {
      serviceUrl: `${serviceUrl}/clients/${clientId}`,
      apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
    });
  } catch (error) {
    result = { success: false, results: [] };
  }

  if (result.results && result.results.length > 0) {
    await WhatsAppPersonalMessageService.logMessageBatch(
      result.results.map((r) => {
        const matchingRecipient = recipients.find(
          (rec: { phone: string; message: string }) => rec.phone === r.phone
        );
        return {
          department_id: whatsappConnection!.department_id,
          connection_id: whatsappConnection!.id,
          recipient_type: 'bulk' as const,
          recipient_phone: r.phone,
          message_content: matchingRecipient?.message || '',
          sent_by: user.id,
          status: r.success ? ('sent' as const) : ('failed' as const),
          error_message: r.error,
        };
      })
    );
  }

  return NextResponse.json(result);
}
