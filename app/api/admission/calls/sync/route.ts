// app/api/admission/calls/sync/route.ts
// GET /api/admission/calls/sync — Pull recent calls from Exotel and sync to MyJKKN
// Called by Vercel Cron every 5 minutes or manually via API
//
// Auth: Requires EXOTEL_API_TOKEN in x-api-token header or ?token= query param
// This prevents unauthorized triggering of the sync

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ExotelClient } from '@/lib/services/telephony/exotel-client';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

// Verify the request is authorized
// Accepts: Vercel CRON_SECRET (Authorization: Bearer <secret>), x-api-token header, or ?token= query param
function verifyAuth(request: NextRequest): boolean {
  // 1. Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader === `Bearer ${cronSecret}`) return true;
  }

  // 2. Manual trigger via x-api-token or ?token=
  const expectedToken = process.env.EXOTEL_API_TOKEN;
  if (!expectedToken) return false;

  const token = request.headers.get('x-api-token')
    || request.nextUrl.searchParams.get('token')
    || '';

  if (!token || token.length !== expectedToken.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Auth check
    if (!verifyAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ExotelClient.isConfigured()) {
      return NextResponse.json({ error: 'Exotel not configured' }, { status: 503 });
    }

    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createServiceRoleClient();

    // Get the timestamp of the most recent call in our DB
    const { data: latestCall } = await supabase
      .from('admission_call_logs')
      .select('created_at')
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch calls from Exotel since the last synced call (or last 1 hour if no calls)
    const sinceTime = latestCall?.created_at
      ? new Date(latestCall.created_at).toISOString().replace('T', ' ').slice(0, 19)
      : new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

    logger.info('telephony/sync', 'Starting sync', { since: sinceTime });

    // Fetch recent calls from Exotel (up to 200)
    const exotelCalls: any[] = [];
    for (let page = 0; page < 4; page++) {
      try {
        const data = await ExotelClient.getRecentCalls(sinceTime, 50, page * 50);
        const calls = data?.Calls || [];
        if (!calls.length) break;

        for (const item of calls) {
          const c = item.Call || item;
          if ((c.Direction || '').toLowerCase() === 'inbound') {
            exotelCalls.push(c);
          }
        }
      } catch (err) {
        logger.error('telephony/sync', `Failed to fetch page ${page}`, err);
        break;
      }
    }

    if (!exotelCalls.length) {
      return NextResponse.json({
        synced: 0,
        skipped: 0,
        message: 'No new calls to sync',
      });
    }

    // Check which CallSids already exist in DB
    const sids = exotelCalls.map(c => c.Sid);
    const { data: existingCalls } = await supabase
      .from('admission_call_logs')
      .select('call_sid')
      .in('call_sid', sids);

    const existingSids = new Set((existingCalls || []).map((c: any) => c.call_sid));

    // Process only new calls
    let synced = 0;
    let skipped = 0;

    for (const c of exotelCalls) {
      if (existingSids.has(c.Sid)) {
        skipped++;
        continue;
      }

      // Build the webhook-like payload and let handleCallStatusCallback process it
      const payload = {
        CallSid: c.Sid,
        Status: c.Status || 'completed',
        Direction: 'incoming',
        From: c.From || '',
        To: c.PhoneNumberSid || c.To || '',
        Duration: String(c.Duration || 0),
        ConversationDuration: String(c.ConversationDuration || c.Duration || 0),
        RecordingUrl: c.RecordingUrl || '',
        Price: String(c.Price || 0),
        StartTime: c.StartTime || '',
        EndTime: c.EndTime || '',
      };

      const result = await TelephonyService.handleCallStatusCallback(payload as any);

      if (result.success) {
        synced++;
      } else {
        logger.warn('telephony/sync', 'Failed to sync call', {
          sid: c.Sid,
          error: result.error,
        });
      }
    }

    logger.info('telephony/sync', 'Sync complete', {
      total: exotelCalls.length,
      synced,
      skipped,
    });

    return NextResponse.json({
      synced,
      skipped,
      total: exotelCalls.length,
      message: `Synced ${synced} new calls, skipped ${skipped} existing`,
    });
  } catch (error) {
    logger.error('telephony/sync', 'Sync failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
