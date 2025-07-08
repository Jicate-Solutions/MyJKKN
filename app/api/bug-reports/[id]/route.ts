import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

    // 1. Fetch the main bug report
    const { data: report, error: reportError } = await supabase
      .from('bug_reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (reportError) {
      // This error is now unexpected since we removed the failing join
      console.error(
        `[BUG_REPORTS_GET_BY_ID_API] Supabase error fetching report ${reportId}:`,
        reportError
      );
      throw reportError;
    }

    if (!report) {
      return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
    }

    // 2. Fetch the reporter's profile information
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', report.reporter_user_id)
      .single();

    if (profileError) {
      // Log as a warning, as a missing profile shouldn't break the entire page
      console.warn(
        `[BUG_REPORTS_GET_BY_ID_API] Could not fetch profile for user ${report.reporter_user_id}:`,
        profileError.message
      );
    }

    // 3. Combine the data into the structure the frontend expects
    const detailedReport = {
      ...report,
      reporter: profile || null
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

    const updateData: { status: string; resolved_at?: string } = { status };
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('bug_reports')
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
