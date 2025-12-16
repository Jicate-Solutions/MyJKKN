import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;

  try {
    // Use admin client to bypass RLS policies with infinite recursion
    const supabase = createAdminClient();

    const { data: participants, error } = await supabase
      .from('bug_report_participants')
      .select(
        `
        *,
        user:profiles!user_id (
          id,
          full_name,
          email,
          role
        )
      `
      )
      .eq('bug_report_id', reportId)
      .eq('is_active', true);

    if (error) throw error;

    return NextResponse.json(participants || []);
  } catch (error) {
    logger.error('bug-reports/api', `Error fetching participants for report ${reportId}`, error);
    return NextResponse.json(
      { error: 'Failed to fetch participants' },
      { status: 500 }
    );
  }
}
