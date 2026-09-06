export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * POST /api/bug-reports/[id]/reopen
 *
 * Allows users to reopen their own resolved bug reports.
 *
 * Security:
 * - Requires authentication
 * - Users can only reopen their own bugs
 * - Bug must be in 'resolved' status
 *
 * Actions:
 * - Changes status from 'resolved' to 'in_progress'
 * - Clears resolved_at timestamp
 * - Creates activity log entry
 *
 * Returns:
 * - 200: Bug reopened successfully
 * - 400: Invalid request (bug not resolved)
 * - 401: Unauthorized (not logged in)
 * - 403: Forbidden (not the reporter)
 * - 404: Bug report not found
 * - 500: Server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: reportId } = await params;

    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch the bug report to verify ownership and status
    const { data: bugReport, error: fetchError } = await supabase
      .from('bug_reports')
      .select('id, display_id, reporter_user_id, status, resolved_at, duplicate_of')
      .eq('id', reportId)
      .single();

    if (fetchError || !bugReport) {
      logger.error('bug-reports/api', 'Bug report not found', fetchError);
      return NextResponse.json(
        { error: 'Bug report not found' },
        { status: 404 }
      );
    }

    // 3. Check if user is the reporter
    if (bugReport.reporter_user_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only reopen your own bug reports' },
        { status: 403 }
      );
    }

    // 4. Check if bug is resolved
    if (bugReport.status !== 'resolved') {
      return NextResponse.json(
        { error: 'Only resolved bugs can be reopened' },
        { status: 400 }
      );
    }

    // 5. Reopen the bug and clear resolved_at.
    // If this report is a duplicate of another bug, re-park it as 'duplicate'
    // (it stays grouped) and reopen the CANONICAL bug instead — that is where
    // the fix work happens, and a reopen on any copy means the fix failed.
    const isDuplicate = !!bugReport.duplicate_of;
    const { data: updatedBug, error: updateError } = await supabase
      .from('bug_reports')
      .update({
        status: isDuplicate ? 'duplicate' : 'in_progress',
        resolved_at: null
      })
      .eq('id', reportId)
      .select()
      .single();

    if (updateError || !updatedBug) {
      logger.error('bug-reports/api', 'Failed to reopen bug', updateError);
      return NextResponse.json(
        { error: 'Failed to reopen bug report' },
        { status: 500 }
      );
    }

    // 6. Add system message to bug report
    const { error: messageError } = await supabase
      .from('bug_report_messages')
      .insert({
        bug_report_id: reportId,
        sender_user_id: user.id,
        message_text: 'Bug report has been reopened.',
        is_internal: false
      });

    if (messageError) {
      logger.warn('bug-reports/api', 'Failed to create reopen message', messageError);
      // Don't fail the request if message creation fails
    }

    // 7. If this was a duplicate, reopen the canonical bug too (admin client:
    // the canonical belongs to a different reporter, so RLS blocks the session
    // client). Failures are logged but don't fail the reporter's reopen.
    if (isDuplicate) {
      try {
        const adminSupabase = createAdminClient();
        const { error: canonicalError } = await (
          adminSupabase.from('bug_reports') as any
        )
          .update({ status: 'in_progress', resolved_at: null })
          .eq('id', bugReport.duplicate_of)
          .eq('status', 'resolved');

        if (canonicalError) {
          logger.error('bug-reports/api', 'Failed to reopen canonical bug', canonicalError);
        } else {
          await (adminSupabase as any).from('bug_report_messages').insert({
            bug_report_id: bugReport.duplicate_of,
            sender_user_id: user.id,
            message_text: `Reopened because duplicate report ${bugReport.display_id} was reopened by its reporter.`,
            is_internal: false
          });
        }
      } catch (err) {
        logger.error('bug-reports/api', 'Unexpected error reopening canonical bug', err);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Bug report reopened successfully',
        data: updatedBug
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('bug-reports/api', 'Unexpected error in reopen', error);
    return NextResponse.json(
      { error: 'Failed to reopen bug report' },
      { status: 500 }
    );
  }
}
