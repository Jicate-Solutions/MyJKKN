import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';

const updateStatusSchema = z.object({
  status: z.enum(['new', 'seen', 'in_progress', 'resolved', 'wont_fix'])
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;
  try {
    const supabase = await createServerSupabaseClient();

    // Check authentication first
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

    // Fetch from the detailed view using RLS-friendly approach
    const { data: report, error: reportError } = await supabase
      .from('bug_reports_with_details')
      .select('*')
      .eq('id', reportId)
      .maybeSingle(); // Use maybeSingle to handle RLS filtering gracefully

    if (reportError) {
      console.error(
        `[BUG_REPORTS_GET_BY_ID_API] Supabase error fetching report ${reportId}:`,
        reportError
      );
      return NextResponse.json(
        { error: 'Database error while fetching report' },
        { status: 500 }
      );
    }

    if (!report) {
      // Report doesn't exist or user doesn't have access (filtered by RLS)
      return NextResponse.json(
        { error: 'Bug report not found or access denied' },
        { status: 404 }
      );
    }

    // Transform the data to match the expected DetailedBugReport interface
    const detailedReport = {
      ...report,
      reporter: report.reporter_name
        ? {
            id: report.reporter_user_id,
            full_name: report.reporter_name,
            email: report.reporter_email,
            role: report.reporter_role
          }
        : null
    };

    return NextResponse.json(detailedReport);
  } catch (error) {
    console.error(
      `[BUG_REPORTS_GET_BY_ID_API] Error fetching report ${reportId}:`,
      error
    );
    return NextResponse.json(
      { error: 'Failed to fetch bug report.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;

  try {
    const supabase = await createServerSupabaseClient();
    const json = await request.json();
    const { status } = updateStatusSchema.parse(json);

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

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user permissions' },
        { status: 500 }
      );
    }

    if (!['super_admin', 'administrator'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only administrators can update bug report status' },
        { status: 403 }
      );
    }

    // Use admin client for the update
    const adminSupabase = createAdminClient();

    const updateData: { status: string; resolved_at?: string } = { status };
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await (adminSupabase.from('bug_reports') as any)
      .update(updateData)
      .eq('id', reportId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error(
      `[BUG_REPORTS_PATCH_API] Error updating report ${reportId}:`,
      error
    );
    return NextResponse.json(
      { error: 'Failed to update bug report status.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;

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

    // Use admin client for deletion operations
    const adminSupabase = createAdminClient();

    // First, get the bug report to find the screenshot URL
    const { data: report, error: fetchError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .select('screenshot_url')
      .eq('id', reportId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json(
        { error: 'Bug report not found' },
        { status: 404 }
      );
    }

    // If there's a screenshot, delete it from storage
    if (report?.screenshot_url) {
      try {
        // Extract the file path from the public URL
        // The URL format is typically: https://...supabase.co/storage/v1/object/public/bug-reports/{reportId}/screenshot.png
        const urlParts = report.screenshot_url.split('/bug-reports/');
        if (urlParts.length > 1) {
          const filePath = urlParts[1];

          const { error: storageError } = await adminSupabase.storage
            .from('bug-reports')
            .remove([filePath]);

          if (storageError) {
            console.error(
              '[BUG_REPORTS_DELETE] Storage deletion error:',
              storageError
            );
            // Continue with database deletion even if storage deletion fails
          } else {
            console.log(
              '[BUG_REPORTS_DELETE] Screenshot deleted successfully:',
              filePath
            );
          }
        }
      } catch (error) {
        console.error(
          '[BUG_REPORTS_DELETE] Error parsing screenshot URL:',
          error
        );
        // Continue with database deletion
      }
    }

    // Delete the bug report from the database
    const { error: deleteError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .delete()
      .eq('id', reportId);

    if (deleteError) {
      throw deleteError;
    }

    console.log(
      '[BUG_REPORTS_DELETE] Bug report deleted successfully:',
      reportId
    );

    return NextResponse.json({
      success: true,
      message: 'Bug report deleted successfully'
    });
  } catch (error) {
    console.error('[BUG_REPORTS_DELETE]', error);
    return NextResponse.json(
      { error: 'Failed to delete bug report' },
      { status: 500 }
    );
  }
}
