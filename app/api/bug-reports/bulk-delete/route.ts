import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';

const bulkDeleteSchema = z.object({
  reportIds: z.array(z.string()).min(1, 'At least one report ID is required')
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

    // Check if user is super admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super administrators can delete bug reports' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const json = await request.json();
    const { reportIds } = bulkDeleteSchema.parse(json);

    // Use admin client for deletion operations
    const adminSupabase = createAdminClient();

    // Get all bug reports to find screenshot URLs
    const { data: reports, error: fetchError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .select('id, screenshot_url')
      .in('id', reportIds);

    if (fetchError) {
      console.error(
        '[BUG_REPORTS_BULK_DELETE] Error fetching reports:',
        fetchError
      );
      throw fetchError;
    }

    // Delete screenshots from storage
    const screenshotsToDelete: string[] = [];

    for (const report of reports || []) {
      if (report.screenshot_url) {
        try {
          const urlParts = report.screenshot_url.split('/bug-reports/');
          if (urlParts.length > 1) {
            screenshotsToDelete.push(urlParts[1]);
          }
        } catch (error) {
          console.error(
            '[BUG_REPORTS_BULK_DELETE] Error parsing screenshot URL:',
            error
          );
        }
      }
    }

    // Delete screenshots in bulk if any exist
    if (screenshotsToDelete.length > 0) {
      const { error: storageError } = await adminSupabase.storage
        .from('bug-reports')
        .remove(screenshotsToDelete);

      if (storageError) {
        console.error(
          '[BUG_REPORTS_BULK_DELETE] Storage deletion error:',
          storageError
        );
        // Continue with database deletion even if storage deletion fails
      } else {
        console.log(
          '[BUG_REPORTS_BULK_DELETE] Screenshots deleted successfully:',
          screenshotsToDelete.length
        );
      }
    }

    // Delete bug reports from database
    const { error: deleteError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .delete()
      .in('id', reportIds);

    if (deleteError) {
      throw deleteError;
    }

    console.log(
      '[BUG_REPORTS_BULK_DELETE] Bug reports deleted successfully:',
      reportIds.length
    );

    return NextResponse.json({
      success: true,
      message: `${reportIds.length} bug report(s) deleted successfully`,
      deletedCount: reportIds.length
    });
  } catch (error) {
    console.error('[BUG_REPORTS_BULK_DELETE]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete bug reports' },
      { status: 500 }
    );
  }
}
