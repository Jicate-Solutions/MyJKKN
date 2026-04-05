// app/api/admission/calls/backfill-cost/route.ts
// POST /api/admission/calls/backfill-cost — Backfill cost_amount from Exotel Price field
// One-time migration endpoint. Auth: CRON_SECRET only.
//
// Fetches each call's details from Exotel API and updates cost_amount + recording_url.
// Processes in batches to respect Exotel rate limits (~5 req/sec).

import { NextRequest, NextResponse } from 'next/server';
import { ExotelClient } from '@/lib/services/telephony/exotel-client';
import { logger } from '@/lib/utils/enhanced-logger';

function verifyAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get('authorization') || '';
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ExotelClient.isConfigured()) {
      return NextResponse.json({ error: 'Exotel not configured' }, { status: 503 });
    }

    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createServiceRoleClient();

    // Parse optional limit from request body (default: 100 per run to stay within Vercel timeout)
    const body = await request.json().catch(() => ({}));
    const batchLimit = Math.min(body.limit || 100, 200);

    // Fetch calls with NULL cost_amount
    const { data: callsToBackfill, error: fetchError } = await supabase
      .from('admission_call_logs')
      .select('id, call_sid')
      .eq('direction', 'inbound')
      .is('cost_amount', null)
      .not('call_sid', 'like', 'pending-%')
      .order('created_at', { ascending: true })
      .limit(batchLimit);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!callsToBackfill?.length) {
      return NextResponse.json({
        updated: 0,
        remaining: 0,
        message: 'No calls need backfilling',
      });
    }

    logger.info('telephony/backfill', 'Starting cost backfill', {
      count: callsToBackfill.length,
    });

    let updated = 0;
    let failed = 0;

    for (const call of callsToBackfill) {
      try {
        const details = await ExotelClient.getCallDetails(call.call_sid);
        const exotelCall = details.Call;

        const updateData: Record<string, any> = {
          cost_amount: parseFloat(exotelCall.Price) || 0,
        };

        // Also backfill recording_url and duration if missing
        if (exotelCall.RecordingUrl) {
          updateData.recording_url = exotelCall.RecordingUrl;
        }
        if (exotelCall.ConversationDuration) {
          const dur = parseInt(exotelCall.ConversationDuration, 10);
          if (dur > 0) updateData.duration_seconds = dur;
        }

        const { error: updateError } = await supabase
          .from('admission_call_logs')
          .update(updateData)
          .eq('id', call.id);

        if (updateError) {
          logger.warn('telephony/backfill', 'Update failed', {
            callId: call.id,
            error: updateError.message,
          });
          failed++;
        } else {
          updated++;
        }

        // Rate limit: ~5 req/sec → 200ms between calls
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        logger.warn('telephony/backfill', 'Exotel fetch failed', {
          callSid: call.call_sid,
          error: err instanceof Error ? err.message : 'Unknown',
        });
        failed++;
      }
    }

    // Check how many remain
    const { count: remaining } = await supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .is('cost_amount', null)
      .not('call_sid', 'like', 'pending-%');

    logger.info('telephony/backfill', 'Backfill complete', {
      updated,
      failed,
      remaining: remaining || 0,
    });

    return NextResponse.json({
      updated,
      failed,
      remaining: remaining || 0,
      message: remaining && remaining > 0
        ? `Updated ${updated} calls. ${remaining} remaining — run again.`
        : `Backfill complete! Updated ${updated} calls.`,
    });
  } catch (error) {
    logger.error('telephony/backfill', 'Backfill failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backfill failed' },
      { status: 500 }
    );
  }
}
