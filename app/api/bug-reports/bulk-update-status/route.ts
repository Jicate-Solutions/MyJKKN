export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { BugReportStatus } from '@/types/bugs';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  BugReportEmailService,
  type BugResolvedEmailData
} from '@/lib/services/email/bug-report-email-service';

const bulkUpdateStatusSchema = z.object({
  reportIds: z.array(z.string()).min(1, 'At least one report ID is required'),
  status: z.enum(['new', 'seen', 'in_progress', 'resolved', 'wont_fix'])
});

export async function POST(request: Request) {
  await connection();
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

    // Fire bulk resolution emails (non-blocking)
    if (status === 'resolved') {
      void sendBulkResolutionEmails(adminSupabase, reportIds);
    }

    return NextResponse.json({
      success: true,
      message: `${reportIds.length} bug report(s) status updated to ${status.replace('_', ' ')} successfully`,
      updatedCount: reportIds.length,
      status
    });
  } catch (error) {
    logger.error('bug-reports/api', 'Bulk update status failed', error);

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

// ---------------------------------------------------------------------------
// Helper: fetch reporter details for all resolved reports and batch-send emails
// ---------------------------------------------------------------------------
async function sendBulkResolutionEmails(
  adminSupabase: ReturnType<typeof createAdminClient>,
  reportIds: string[]
): Promise<void> {
  try {
    const { data: details, error } = await (
      adminSupabase.from('bug_reports_with_details') as any
    )
      .select(
        'id, display_id, reporter_email, reporter_name, description, page_url, institution_name, resolved_at'
      )
      .in('id', reportIds);

    if (error || !details) {
      logger.warn('bug-reports/email', 'Could not fetch report details for bulk email', { count: reportIds.length });
      return;
    }

    const emailDataList: BugResolvedEmailData[] = details
      .filter((d: any) => !!d.reporter_email)
      .map((d: any) => ({
        reportId: d.id,
        displayId: d.display_id,
        reporterEmail: d.reporter_email,
        reporterName: d.reporter_name,
        description: d.description,
        pageUrl: d.page_url,
        institutionName: d.institution_name,
        resolvedAt: d.resolved_at ?? new Date().toISOString()
      }));

    const { sent, failed, skipped } =
      await BugReportEmailService.sendBulkResolvedEmails(emailDataList);

    // Log each send attempt
    if (emailDataList.length > 0) {
      const logRows = emailDataList.map(r => ({
        bug_report_id: r.reportId,
        recipient_email: r.reporterEmail,
        email_type: 'resolved_notification',
        // Mark as sent optimistically; individual failures are captured in the service logger
        status: 'sent'
      }));
      await (adminSupabase as any).from('bug_report_email_logs').insert(logRows);
    }

    logger.info('bug-reports/email', 'Bulk resolution email summary', {
      total: reportIds.length,
      sent,
      failed,
      skipped
    });
  } catch (err) {
    logger.error('bug-reports/email', 'Unexpected error in sendBulkResolutionEmails', err);
  }
}
