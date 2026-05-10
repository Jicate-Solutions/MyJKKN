export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalGetStatusAPI } from '@/lib/whatsapp/personal-api-client';

export async function GET(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const departmentId = request.nextUrl.searchParams.get('department_id');

  // Support "any" mode for super admins who don't have a department
  let whatsappConnection: Awaited<ReturnType<typeof WhatsAppPersonalConnectionService.getConnection>> = null;

  if (departmentId && departmentId !== 'any') {
    whatsappConnection = await WhatsAppPersonalConnectionService.getConnection(departmentId);
  }
  if (!whatsappConnection) {
    whatsappConnection = await WhatsAppPersonalConnectionService.getAnyReadyConnection();
  }

  if (!whatsappConnection) {
    return NextResponse.json({
      status: 'disconnected',
      phone_number: null,
      connected: false,
    });
  }

  if (whatsappConnection.status === 'disconnected' && !whatsappConnection.service_url) {
    return NextResponse.json({
      ...whatsappConnection,
      connected: false,
    });
  }

  const shouldPollLive = whatsappConnection.service_url && (
    whatsappConnection.status === 'connecting' ||
    whatsappConnection.status === 'qr_ready' ||
    whatsappConnection.status === 'authenticated' ||
    whatsappConnection.status === 'ready'
  );

  if (shouldPollLive) {
    const clientId = whatsappConnection.client_id || `dept-${whatsappConnection.department_id}`;

    try {
      const liveStatus = await personalGetStatusAPI({
        serviceUrl: `${whatsappConnection.service_url}/clients/${clientId}`,
        apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
      });

      if (liveStatus.status !== whatsappConnection.status) {
        await WhatsAppPersonalConnectionService.updateStatus(
          whatsappConnection.department_id,
          liveStatus.status,
          {
            phone_number: liveStatus.clientInfo?.phoneNumber,
            push_name: liveStatus.clientInfo?.pushName,
          }
        );
      }

      return NextResponse.json({
        id: whatsappConnection.id,
        department_id: whatsappConnection.department_id,
        status: liveStatus.status,
        qr_code: liveStatus.qrCode || null,
        phone_number: liveStatus.clientInfo?.phoneNumber || whatsappConnection.phone_number,
        push_name: liveStatus.clientInfo?.pushName || whatsappConnection.push_name,
        connected_at: whatsappConnection.connected_at,
        connected: liveStatus.status === 'ready',
      });
    } catch (err) {
      console.error('[whatsapp-personal/status] Railway poll failed:', err instanceof Error ? err.message : err);
      return NextResponse.json({
        id: whatsappConnection.id,
        department_id: whatsappConnection.department_id,
        status: whatsappConnection.status,
        phone_number: whatsappConnection.phone_number,
        push_name: whatsappConnection.push_name,
        connected_at: whatsappConnection.connected_at,
        connected: whatsappConnection.status === 'ready',
        error: `Service poll failed: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    }
  }

  return NextResponse.json({
    ...whatsappConnection,
    connected: whatsappConnection.status === 'ready',
  });
}
