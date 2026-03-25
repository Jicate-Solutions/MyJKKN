import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const previous7Days = new Date();
    previous7Days.setDate(previous7Days.getDate() - 14);

    // Run all count queries in parallel using HEAD-only requests (no row data transferred)
    const [
      { count: total },
      { count: resolved },
      { count: inProgress },
      { count: newReports },
      { count: seen },
      { count: wontFix },
      { count: recentReports },
      { count: previousReports }
    ] = await Promise.all([
      supabase.from('bug_reports').select('*', { count: 'exact', head: true }),
      supabase.from('bug_reports').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
      supabase.from('bug_reports').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabase.from('bug_reports').select('*', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('bug_reports').select('*', { count: 'exact', head: true }).eq('status', 'seen'),
      supabase.from('bug_reports').select('*', { count: 'exact', head: true }).eq('status', 'wont_fix'),
      supabase.from('bug_reports').select('*', { count: 'exact', head: true }).gte('created_at', last7Days.toISOString()),
      supabase
        .from('bug_reports')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', previous7Days.toISOString())
        .lt('created_at', last7Days.toISOString())
    ]);

    const totalCount = total ?? 0;
    const resolvedCount = resolved ?? 0;
    const recentCount = recentReports ?? 0;
    const previousCount = previousReports ?? 0;

    const trendValue =
      previousCount > 0
        ? ((recentCount - previousCount) / previousCount) * 100
        : recentCount > 0
        ? 100
        : 0;

    const resolutionRate =
      totalCount > 0 ? ((resolvedCount / totalCount) * 100).toFixed(1) : '0.0';

    return NextResponse.json({
      total: totalCount,
      resolved: resolvedCount,
      inProgress: inProgress ?? 0,
      newReports: newReports ?? 0,
      seen: seen ?? 0,
      wontFix: wontFix ?? 0,
      resolutionRate,
      recentReports: recentCount,
      previousReports: previousCount,
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
