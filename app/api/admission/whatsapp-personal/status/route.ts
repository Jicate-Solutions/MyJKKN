import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalGetStatusAPI } from '@/lib/whatsapp/personal-api-client';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const institutionId = request.nextUrl.searchParams.get('institution_id');
  if (!institutionId) return NextResponse.json({ error: 'institution_id required' }, { status: 400 });

  const connection = await WhatsAppPersonalConnectionService.getConnection(institutionId);

  if (!connection) {
    return NextResponse.json({
      status: 'disconnected',
      phone_number: null,
      connected: false,
    });
  }

  if (connection.service_url && connection.status !== 'disconnected') {
    try {
      const liveStatus = await personalGetStatusAPI({
        serviceUrl: connection.service_url,
        apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
      });

      if (liveStatus.status !== connection.status) {
        await WhatsAppPersonalConnectionService.updateStatus(
          institutionId,
          liveStatus.status,
          {
            phone_number: liveStatus.clientInfo?.phoneNumber,
            push_name: liveStatus.clientInfo?.pushName,
          }
        );
      }

      return NextResponse.json({
        ...connection,
        status: liveStatus.status,
        qr_code: liveStatus.qrCode || null,
        phone_number: liveStatus.clientInfo?.phoneNumber || connection.phone_number,
        connected: liveStatus.status === 'ready',
      });
    } catch {
      await WhatsAppPersonalConnectionService.updateStatus(institutionId, 'disconnected');
      return NextResponse.json({
        ...connection,
        status: 'disconnected',
        connected: false,
        error: 'Service unreachable',
      });
    }
  }

  return NextResponse.json({
    ...connection,
    connected: connection.status === 'ready',
  });
}
