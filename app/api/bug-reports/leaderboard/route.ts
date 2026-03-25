import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// Helper to get ISO date string for the beginning of the current week (Monday 00:00 UTC)
function getWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day; // adjust to previous Monday
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff)
  );
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

// Helper to get ISO date string for the beginning of the current month (1st 00:00 UTC)
function getMonthStart(): string {
  const now = new Date();
  const firstDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  firstDay.setUTCHours(0, 0, 0, 0);
  return firstDay.toISOString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = url.searchParams.get('period') ?? 'overall'; // overall | week | month
  try {
    // Use admin client to bypass RLS for leaderboard data
    // This is appropriate since leaderboard data should be publicly visible to all users
    // We're only returning aggregated public data (names and bug counts)
    const supabase = createAdminClient();

    // Get all users who have submitted bug reports
    const { data: usersWithBugs, error: usersError } = await (
      (supabase as any).from('bug_reports') as any
    )
      .select('reporter_user_id')
      .not('reporter_user_id', 'is', null);

    if (usersError) {
      logger.error('bug-reports/api', 'Users fetch error', usersError);
      throw usersError;
    }

    // Get unique user IDs
    const uniqueUserIds = [
      ...new Set(usersWithBugs.map((report: any) => report.reporter_user_id))
    ];

    // Get user profiles and bug report counts
    const leaderboardData = await Promise.all(
      uniqueUserIds.map(async (userId: any) => {
        // Get user profile
        const { data: userProfile, error: profileError } = await (
          (supabase as any).from('profiles') as any
        )
          .select('id, full_name, avatar_url')
          .eq('id', userId)
          .single();

        if (profileError) {
          logger.error('bug-reports/api', `Error fetching profile for user: ${userId}`, profileError);
          return null;
        }

        // Build date filter based on period
        const filters: Record<string, string> = {};
        if (period === 'week') {
          filters['created_at'] = getWeekStart();
        } else if (period === 'month') {
          filters['created_at'] = getMonthStart();
        }

        // Helper to build query with optional date filter
        const buildQuery = (statusFilter?: string) => {
          let query = ((supabase as any).from('bug_reports') as any)
            .select('*', { count: 'exact', head: true })
            .eq('reporter_user_id', userId);
          if (statusFilter) query = query.eq('status', statusFilter);
          if (period !== 'overall')
            query = query.gte('created_at', filters['created_at']);
          return query;
        };

        const { count: totalBugs, error: totalError } = await buildQuery();

        const { count: resolvedBugs, error: resolvedError } = await buildQuery(
          'resolved'
        );

        if (totalError || resolvedError) {
          logger.error('bug-reports/api', `Error fetching bug counts for user: ${userId}`, { totalError, resolvedError });
          return null;
        }

        return {
          user_id: userProfile?.id || userId,
          user_name: userProfile?.full_name || 'Unknown',
          avatar_url: userProfile?.avatar_url || null,
          total_bugs_count: totalBugs || 0,
          resolved_bugs_count: resolvedBugs || 0
        };
      })
    );

    // Filter out null results and sort by total bugs count (descending)
    const validData = leaderboardData
      .filter(
        (item): item is NonNullable<(typeof leaderboardData)[number]> =>
          !!item && item.total_bugs_count > 0
      )
      .sort((a, b) => {
        // Sort by total bugs count (descending) then by resolved bugs count
        if (b.total_bugs_count !== a.total_bugs_count) {
          return b.total_bugs_count - a.total_bugs_count;
        }
        return b.resolved_bugs_count - a.resolved_bugs_count;
      })
      .slice(0, 50);

    // Return period in response header for clarity (optional)
    // Alternatively include in body

    return NextResponse.json(validData);
  } catch (error) {
    logger.error('bug-reports/api', 'Failed to fetch leaderboard', error);
    return NextResponse.json(
      { error: 'Failed to fetch the leaderboard.' },
      { status: 500 }
    );
  }
}
