export const dynamic = 'force-dynamic';

// app/api/whatsapp-personal/queue/route.ts
// Processes the personal WhatsApp message queue.
// POST: Process queue (cron or admin triggered)
// GET: Get queue stats

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { WhatsAppPersonalQueueService } from '@/lib/services/whatsapp/whatsapp-personal-queue-service';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  await connection();

  // Auth: either CRON_SECRET header or authenticated user
  const cronSecret = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');
  const isCron = cronSecret === process.env.CRON_SECRET;

  if (!isCron) {
    const { user, error } = await getAuthUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json().catch(() => ({}));
    const limit = (body as any)?.limit || 50;

    const result = await WhatsAppPersonalQueueService.processQueue(limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[whatsapp-personal/queue] Process error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Queue processing failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  await connection();

  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const institutionId = request.nextUrl.searchParams.get('institution_id') || undefined;

  try {
    const stats = await WhatsAppPersonalQueueService.getQueueStats(institutionId);
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get stats' },
      { status: 500 }
    );
  }
}
