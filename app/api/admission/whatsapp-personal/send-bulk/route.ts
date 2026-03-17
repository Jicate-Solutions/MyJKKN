import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';
import { personalSendBulkAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { institution_id, recipients, delay_ms } = body;

  if (!institution_id || !recipients?.length) {
    return NextResponse.json({ error: 'institution_id and recipients required' }, { status: 400 });
  }

  const connection = await WhatsAppPersonalConnectionService.getConnection(institution_id);
  if (!connection || connection.status !== 'ready') {
    return NextResponse.json({ error: 'Personal WhatsApp not connected' }, { status: 503 });
  }

  let result: { success: boolean; results?: { phone: string; success: boolean; error?: string }[]; totalSent?: number; successCount?: number; failCount?: number };
  try {
    result = await personalSendBulkAPI(recipients, delay_ms || 1500);
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
          institution_id,
          connection_id: connection.id,
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
