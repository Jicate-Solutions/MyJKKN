import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Use the security definer function to bypass RLS restrictions
    const { data: leaderboardData, error } = await supabase
      .rpc('get_bug_leaderboard')
      .limit(50);

    if (error) {
      console.error('[BUG_REPORTS_LEADERBOARD_GET_API] Database error:', error);
      throw error;
    }

    return NextResponse.json(leaderboardData || []);
  } catch (error) {
    console.error('[BUG_REPORTS_LEADERBOARD_GET_API]', error);
    return NextResponse.json(
      { error: 'Failed to fetch the leaderboard.' },
      { status: 500 }
    );
  }
}
