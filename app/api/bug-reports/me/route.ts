export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import { stripAiMetadata } from '@/lib/api/bug-reports/handlers/report';


export async function GET() {
  await connection();
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
      logger.error('bug-reports/api', 'Database error fetching user reports', error);
      throw error;
    }

    // ── AI text is for admins and bug fixers ONLY (Director decision #4,
    // 2026-10-10). This route is entirely reporter-scoped — it is filtered to
    // `reporter_user_id = user.id` and backs the reporter's own "My bug reports"
    // list — and it selects `*`, so every AI key on every one of their rows was
    // travelling to the browser. Their screen has never rendered those keys, but
    // the raw briefing (severity, root cause, fix steps) and the duplicate
    // verdict were in the page data. That was 8 reports' worth across the whole
    // table; the automatic producer makes it every open report.
    //
    // Stripped UNCONDITIONALLY here, with no role check: there is no admin view
    // of this endpoint to preserve. An admin looking at a bug through the ADMIN
    // page goes via /api/bug-reports/[id], which keeps the AI text for them.
    return NextResponse.json((myReports || []).map(stripAiMetadata));
  } catch (error) {
    logger.error('bug-reports/api', 'Failed to fetch user bug reports', error);
    return NextResponse.json(
      { error: 'Failed to fetch your bug reports.' },
      { status: 500 }
    );
  }
}
