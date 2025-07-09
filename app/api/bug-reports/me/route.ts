import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the authenticated user
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Fetch the user's bug reports with reporter information
    const { data: myReports, error } = await supabase
      .from('bug_reports')
      .select(
        `
        *,
        reporter:profiles!reporter_user_id (
          id,
          full_name,
          email
        )
      `
      )
      .eq('reporter_user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[BUG_REPORTS_ME_GET_API] Database error:', error);
      throw error;
    }

    return NextResponse.json(myReports || []);
  } catch (error) {
    console.error('[BUG_REPORTS_ME_GET_API]', error);
    return NextResponse.json(
      { error: 'Failed to fetch your bug reports.' },
      { status: 500 }
    );
  }
}
