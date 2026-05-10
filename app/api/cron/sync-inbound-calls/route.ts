export const dynamic = 'force-dynamic';

// app/api/cron/sync-inbound-calls/route.ts
// Vercel Cron: every 15 minutes, sync inbound CDRs for all active institutions

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { InboundCallSyncService } from '@/lib/services/telephony/inbound-call-sync-service';
import { isExotelConfigured } from '@/lib/services/telephony/exotel-client';
import { capturePipelineErrorAsync } from '@/lib/services/telephony/error-capture';
import { logger } from '@/lib/utils/enhanced-logger';

export const maxDuration = 300; // Allow up to 5 minutes for sync (Vercel Pro ceiling)

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isExotelConfigured()) {
    return NextResponse.json({
      success: false,
      message: 'Exotel not configured — skipping sync',
    });
  }

  const supabase = createServiceRoleClient();

  try {
    // Get all active institutions
    const { data: institutions, error } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('is_active', true);

    if (error || !institutions?.length) {
      return NextResponse.json({
        success: false,
        message: error?.message || 'No active institutions found',
      });
    }

    const results: Record<string, any> = {};

    // Sync each institution sequentially to respect Exotel rate limits
    for (const institution of institutions) {
      try {
        const result = await InboundCallSyncService.syncInboundCalls(
          institution.id,
          supabase
        );
        results[institution.id] = {
          name: institution.name,
          synced: result.synced,
          matched: result.matched,
          errors: result.errors.length,
          durationMs: result.durationMs,
        };
      } catch (instError) {
        logger.error('cron/sync-inbound-calls', `Sync failed for institution ${institution.name}`, instError);
        capturePipelineErrorAsync('cron', instError, {
          institutionId: institution.id,
          extra: { institution_name: institution.name, site: 'per_institution_sync' },
        });
        results[institution.id] = {
          name: institution.name,
          error: instError instanceof Error ? instError.message : String(instError),
        };
      }
    }

    const totalSynced = Object.values(results).reduce(
      (sum: number, r: any) => sum + (r.synced || 0),
      0
    );

    logger.info('cron/sync-inbound-calls', 'Cron sync completed', {
      institutions: institutions.length,
      totalSynced,
    });

    return NextResponse.json({
      success: true,
      totalSynced,
      institutions: results,
    });
  } catch (error) {
    logger.error('cron/sync-inbound-calls', 'Cron sync failed', error);
    capturePipelineErrorAsync('cron', error, {
      extra: { site: 'top_level_cron' },
    });
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Cron failed' },
      { status: 500 }
    );
  }
}
