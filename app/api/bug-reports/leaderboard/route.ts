import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get all users who have submitted bug reports
    const { data: usersWithBugs, error: usersError } = await supabase
      .from('bug_reports')
      .select('reporter_user_id')
      .not('reporter_user_id', 'is', null);

    if (usersError) {
      console.error(
        '[BUG_REPORTS_LEADERBOARD_GET_API] Users fetch error:',
        usersError
      );
      throw usersError;
    }

    // Get unique user IDs
    const uniqueUserIds = [
      ...new Set(usersWithBugs.map((report) => report.reporter_user_id))
    ];

    // Get user profiles and bug report counts
    const leaderboardData = await Promise.all(
      uniqueUserIds.map(async (userId) => {
        // Get user profile
        const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', userId)
          .single();

        if (profileError) {
          console.error(
            'Error fetching profile for user:',
            userId,
            profileError
          );
          return null;
        }

        // Get total bug reports for this user
        const { count: totalBugs, error: totalError } = await supabase
          .from('bug_reports')
          .select('*', { count: 'exact', head: true })
          .eq('reporter_user_id', userId);

        // Get resolved bug reports for this user
        const { count: resolvedBugs, error: resolvedError } = await supabase
          .from('bug_reports')
          .select('*', { count: 'exact', head: true })
          .eq('reporter_user_id', userId)
          .eq('status', 'resolved');

        if (totalError || resolvedError) {
          console.error('Error fetching bug counts for user:', userId, {
            totalError,
            resolvedError
          });
          return null;
        }

        return {
          user_id: userProfile.id,
          user_name: userProfile.full_name,
          avatar_url: userProfile.avatar_url,
          total_bugs_count: totalBugs || 0,
          resolved_bugs_count: resolvedBugs || 0
        };
      })
    );

    // Filter out null results and sort by total bugs count (descending)
    const validData = leaderboardData
      .filter((item) => item !== null && item.total_bugs_count > 0)
      .sort((a, b) => {
        // Sort by total bugs count (descending) then by resolved bugs count
        if (b.total_bugs_count !== a.total_bugs_count) {
          return b.total_bugs_count - a.total_bugs_count;
        }
        return b.resolved_bugs_count - a.resolved_bugs_count;
      })
      .slice(0, 50);

    return NextResponse.json(validData);
  } catch (error) {
    console.error('[BUG_REPORTS_LEADERBOARD_GET_API]', error);
    return NextResponse.json(
      { error: 'Failed to fetch the leaderboard.' },
      { status: 500 }
    );
  }
}
