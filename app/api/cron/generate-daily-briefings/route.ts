export const dynamic = 'force-dynamic';

// app/api/cron/generate-daily-briefings/route.ts
// Vercel Cron: daily at 00:30 UTC (06:00 IST) — pre-generate briefings for all active counselors

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateDailyBriefing } from '@/lib/services/admission/briefing-delivery-service';
import { logger } from '@/lib/utils/enhanced-logger';

export const maxDuration = 300; // Allow up to 5 minutes for all institutions

interface CounselorRow {
  id: string;
  user_id: string;
  institution_id: string;
}

interface ErrorEntry {
  counselor_id: string;
  error: string;
}

export async function GET(request: NextRequest) {
  // Verify cron secret — matches pattern in sync-inbound-calls/route.ts
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const today = new Date().toISOString().split('T')[0];

  // Fetch all active counselors with a user_id (needed to call generateDailyBriefing)
  const { data: counselors, error: fetchError } = await supabase
    .from('admission_counselors')
    .select('id, user_id, institution_id')
    .eq('is_active', true)
    .not('user_id', 'is', null);

  if (fetchError) {
    logger.error('admission/briefing-cron', 'Failed to fetch active counselors', fetchError);
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: fetchError.message },
      { status: 500 }
    );
  }

  if (!counselors || counselors.length === 0) {
    logger.info('admission/briefing-cron', 'No active counselors found — nothing to generate');
    return NextResponse.json({ attempted: 0, created: 0, skipped_existing: 0, errors: [] });
  }

  let attempted = 0;
  let created = 0;
  let skipped_existing = 0;
  const errors: ErrorEntry[] = [];

  for (const counselor of counselors as CounselorRow[]) {
    attempted++;

    try {
      // Idempotency check: skip if a briefing already exists for this counselor's
      // institution today. generateDailyBriefing() itself also checks getTodaysBriefing()
      // but we do a lightweight DB check here to avoid the full computation cost.
      const { data: existing, error: checkError } = await supabase
        .from('admission_daily_briefings')
        .select('id')
        .eq('institution_id', counselor.institution_id)
        .eq('briefing_date', today)
        .maybeSingle();

      if (checkError) {
        // Table might not exist or query failed — fall through and let generateDailyBriefing handle it
        logger.warn('admission/briefing-cron', `Idempotency check failed for counselor ${counselor.id}`, checkError);
      }

      if (existing) {
        skipped_existing++;
        continue;
      }

      await generateDailyBriefing(counselor.user_id, counselor.institution_id);
      created++;

      logger.info('admission/briefing-cron', `Briefing generated`, {
        counselor_id: counselor.id,
        institution_id: counselor.institution_id,
        date: today,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ counselor_id: counselor.id, error: message });
      logger.error('admission/briefing-cron', `Failed for counselor ${counselor.id}`, err);
    }
  }

  const summary = { attempted, created, skipped_existing, errors };

  logger.info('admission/briefing-cron', 'Daily briefing cron completed', summary);

  return NextResponse.json(summary);
}
