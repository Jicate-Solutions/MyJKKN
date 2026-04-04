export const dynamic = 'force-dynamic';

// app/api/admission/expos/wa-queue/route.ts
// Process the expo WhatsApp message queue — retries failed messages.
// Can be called by a cron job or manually by an admin.
// Protected by CRON_SECRET for automated calls, or auth for manual calls.

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { ExpoWhatsAppService } from '@/lib/services/admission/expo-whatsapp-service';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  await connection();

  // Allow cron secret OR authenticated admin
  const cronSecret = request.headers.get('x-cron-secret');
  const isAuthorizedCron = cronSecret === process.env.CRON_SECRET;

  if (!isAuthorizedCron) {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await ExpoWhatsAppService.processQueue();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[admission/expo-wa] Queue processor error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// GET for health check / stats
export async function GET(request: NextRequest) {
  await connection();

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Return queue stats (pending, failed counts)
    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createServiceRoleClient();

    const { data } = await (supabase as any)
      .from('expo_wa_message_queue')
      .select('status')
      .in('status', ['queued', 'failed']);

    const queued = (data || []).filter((m: any) => m.status === 'queued').length;
    const failed = (data || []).filter((m: any) => m.status === 'failed').length;

    return NextResponse.json({
      queued,
      failed,
      total_pending: queued + failed,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
