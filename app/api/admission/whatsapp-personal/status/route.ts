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

  // Get DB connection record — try given institution first, then any ready connection
  let connection = await WhatsAppPersonalConnectionService.getConnection(institutionId);
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

  // If status is disconnected and no service_url, just return DB state
  if (connection.status === 'disconnected' && !connection.service_url) {
    return NextResponse.json({
      ...connection,
      connected: false,
    });
  }

  // If we have a service_url, poll Railway for live status
  // (only when in a transitional state OR to verify ready connections)
  const shouldPollLive = connection.service_url && (
    connection.status === 'connecting' ||
    connection.status === 'qr_ready' ||
    connection.status === 'authenticated' ||
    connection.status === 'ready'
  );

  if (shouldPollLive) {
    try {
      const liveStatus = await personalGetStatusAPI({
        serviceUrl: connection.service_url!,
        apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
      });

      // Only update DB if status actually changed
      if (liveStatus.status !== connection.status) {
        const phoneNumber = liveStatus.clientInfo?.phoneNumber || undefined;
        const pushName = liveStatus.clientInfo?.pushName || undefined;

        await WhatsAppPersonalConnectionService.updateStatus(
          institutionId,
          liveStatus.status,
          { phone_number: phoneNumber, push_name: pushName }
        );
      }

      return NextResponse.json({
        id: connection.id,
        institution_id: connection.institution_id,
        status: liveStatus.status,
        qr_code: liveStatus.qrCode || null,
        phone_number: liveStatus.clientInfo?.phoneNumber || connection.phone_number,
        push_name: liveStatus.clientInfo?.pushName || connection.push_name,
        connected_at: connection.connected_at,
        connected: liveStatus.status === 'ready',
      });
    } catch (err) {
      console.error('[whatsapp-personal/status] Railway poll failed:', err instanceof Error ? err.message : err);
      // Don't mark disconnected on transient failures — return DB state as-is
      // Only the disconnect route should set status to disconnected
      return NextResponse.json({
        id: connection.id,
        institution_id: connection.institution_id,
        status: connection.status,
        phone_number: connection.phone_number,
        push_name: connection.push_name,
        connected_at: connection.connected_at,
        connected: connection.status === 'ready',
        error: `Service poll failed: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    }
  }

  // Fallback: return DB state
  return NextResponse.json({
    ...connection,
    connected: connection.status === 'ready',
  });
}
