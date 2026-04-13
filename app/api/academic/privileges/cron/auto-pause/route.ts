import { NextRequest, NextResponse } from 'next/server';
import { PrivilegeService } from '@/lib/services/academic/privilege-service';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * GET /api/academic/privileges/cron/auto-pause
 *
 * Monthly cron job that pauses privilege members who don't have an
 * approved renewal record for the current month.
 *
 * Triggered by Vercel Cron on the 1st of each month at midnight UTC.
 * Can also be called manually with the correct CRON_SECRET.
 *
 * Security: Requires Bearer token matching CRON_SECRET env var.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString().split('T')[0];

    const result = await PrivilegeService.autoPauseExpiredRenewals(currentMonth);

    return NextResponse.json({
      success: true,
      month: currentMonth,
      paused_count: result.paused_count,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('academic/privileges', 'Auto-pause cron error', error);
    return NextResponse.json(
      { error: error.message || 'Auto-pause failed' },
      { status: 500 }
    );
  }
}
