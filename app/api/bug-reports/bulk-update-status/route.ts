import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { BugReportStatus } from '@/types/bugs';

const bulkUpdateStatusSchema = z.object({
  reportIds: z.array(z.string()).min(1, 'At least one report ID is required'),
  status: z.enum(['new', 'seen', 'in_progress', 'resolved', 'wont_fix'])
});

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    // Check if user is authenticated
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

    // Check if user has admin permissions
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !['admin', 'super_admin'].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: 'Admin permissions required to update bug report status' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const json = await request.json();
    const { reportIds, status } = bulkUpdateStatusSchema.parse(json);

    // Use admin client for update operations
    const adminSupabase = createAdminClient();

    // Update resolved_at timestamp if status is resolved
    const updateData: any = { status };
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    } else {
      // Clear resolved_at if status is changed from resolved to something else
      updateData.resolved_at = null;
    }

    // Update bug reports status
    const { error: updateError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .update(updateData)
      .in('id', reportIds);

    if (updateError) {
      throw updateError;
    }

    console.log(
      '[BUG_REPORTS_BULK_UPDATE_STATUS] Bug reports status updated successfully:',
      reportIds.length,
      'reports to status:',
      status
    );

    return NextResponse.json({
      success: true,
      message: `${
        reportIds.length
      } bug report(s) status updated to ${status.replace(
        '_',
        ' '
      )} successfully`,
      updatedCount: reportIds.length,
      status
    });
  } catch (error) {
    console.error('[BUG_REPORTS_BULK_UPDATE_STATUS]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update bug report status' },
      { status: 500 }
    );
  }
}
