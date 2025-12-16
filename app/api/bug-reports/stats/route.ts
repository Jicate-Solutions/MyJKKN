import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Fetch all status counts in a single optimized query
    const { data: statusCounts, error: countError } = await supabase
      .from('bug_reports')
      .select('status');

    if (countError) {
      logger.error('bug-reports/api', 'Error fetching stats', countError);
      throw countError;
    }

    // Calculate statistics from all reports
    const total = statusCounts?.length || 0;
    const resolved = statusCounts?.filter((r) => r.status === 'resolved').length || 0;
    const inProgress = statusCounts?.filter((r) => r.status === 'in_progress').length || 0;
    const newReports = statusCounts?.filter((r) => r.status === 'new').length || 0;
    const seen = statusCounts?.filter((r) => r.status === 'seen').length || 0;
    const wontFix = statusCounts?.filter((r) => r.status === 'wont_fix').length || 0;

    // Fetch recent reports count (last 7 days)
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const previous7Days = new Date();
    previous7Days.setDate(previous7Days.getDate() - 14);

    const { data: recentData, error: recentError } = await supabase
      .from('bug_reports')
      .select('created_at')
      .gte('created_at', previous7Days.toISOString());

    if (recentError) {
      logger.error('bug-reports/api', 'Error fetching recent stats', recentError);
    }

    const recentReports = recentData?.filter(
      (r) => new Date(r.created_at) >= last7Days
    ).length || 0;

    const previousReports = recentData?.filter(
      (r) => new Date(r.created_at) >= previous7Days && new Date(r.created_at) < last7Days
    ).length || 0;

    // Calculate trend
    const trendValue = previousReports > 0
      ? ((recentReports - previousReports) / previousReports) * 100
      : recentReports > 0 ? 100 : 0;

    const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0.0';

    return NextResponse.json({
      total,
      resolved,
      inProgress,
      newReports,
      seen,
      wontFix,
      resolutionRate,
      recentReports,
      previousReports,
      reportsTrend: {
        value: trendValue.toFixed(1),
        direction: trendValue > 0 ? 'up' : trendValue < 0 ? 'down' : 'neutral'
      }
    });
  } catch (error) {
    logger.error('bug-reports/api', 'Unexpected error fetching stats', error);
    return NextResponse.json(
      { error: 'Failed to fetch bug report statistics.' },
      { status: 500 }
    );
  }
}
