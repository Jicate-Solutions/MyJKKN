import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalGetStatusAPI } from '@/lib/whatsapp/personal-api-client';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const departmentId = request.nextUrl.searchParams.get('department_id');
  if (!departmentId) return NextResponse.json({ error: 'department_id required' }, { status: 400 });

  // Get DB connection record — try given department first, then any ready connection
  let connection = await WhatsAppPersonalConnectionService.getConnection(departmentId);
  if (!connection) {
    connection = await WhatsAppPersonalConnectionService.getAnyReadyConnection();
  }

  if (!connection) {
    return NextResponse.json({
      status: 'disconnected',
      phone_number: null,
      connected: false,
    });
  }

  if (connection.status === 'disconnected' && !connection.service_url) {
    return NextResponse.json({
      ...connection,
      connected: false,
    });
  }

  const shouldPollLive = connection.service_url && (
    connection.status === 'connecting' ||
    connection.status === 'qr_ready' ||
    connection.status === 'authenticated' ||
    connection.status === 'ready'
  );

  if (shouldPollLive) {
    const clientId = connection.client_id || `dept-${connection.department_id}`;

    try {
      const liveStatus = await personalGetStatusAPI({
        serviceUrl: `${connection.service_url}/clients/${clientId}`,
        apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
      });

      if (liveStatus.status !== connection.status) {
        await WhatsAppPersonalConnectionService.updateStatus(
          connection.department_id,
          liveStatus.status,
          {
            phone_number: liveStatus.clientInfo?.phoneNumber,
            push_name: liveStatus.clientInfo?.pushName,
          }
        );
      }

      return NextResponse.json({
        id: connection.id,
        department_id: connection.department_id,
        status: liveStatus.status,
        qr_code: liveStatus.qrCode || null,
        phone_number: liveStatus.clientInfo?.phoneNumber || connection.phone_number,
        push_name: liveStatus.clientInfo?.pushName || connection.push_name,
        connected_at: connection.connected_at,
        connected: liveStatus.status === 'ready',
      });
    } catch (err) {
      console.error('[whatsapp-personal/status] Railway poll failed:', err instanceof Error ? err.message : err);
      return NextResponse.json({
        id: connection.id,
        department_id: connection.department_id,
        status: connection.status,
        phone_number: connection.phone_number,
        push_name: connection.push_name,
        connected_at: connection.connected_at,
        connected: connection.status === 'ready',
        error: `Service poll failed: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    }
  }

  return NextResponse.json({
    ...connection,
    connected: connection.status === 'ready',
  });
}
