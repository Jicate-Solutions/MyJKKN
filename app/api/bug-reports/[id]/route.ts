export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  BugReportEmailService,
  type BugResolvedEmailData
} from '@/lib/services/email/bug-report-email-service';

const updateStatusSchema = z.object({
  status: z.enum(['new', 'seen', 'in_progress', 'resolved', 'wont_fix', 'duplicate']),
  // Required when status === 'duplicate': the canonical bug this report duplicates.
  duplicate_of: z.string().uuid().optional()
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
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
      logger.error('bug-reports', `Supabase error fetching report ${reportId}`, reportError);
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
    logger.error('bug-reports', `Error fetching report ${reportId}`, error);
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
  await connection();
  const { id: reportId } = await params;

  try {
    const supabase = await createServerSupabaseClient();
    const json = await request.json();
    const { status, duplicate_of: duplicateOfInput } = updateStatusSchema.parse(json);

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
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user permissions' },
        { status: 500 }
      );
    }

    if ((!(profile as any).is_super_admin && !['super_admin', 'administrator', 'ceo'].includes(profile.role))) {
      return NextResponse.json(
        { error: 'Only administrators can update bug report status' },
        { status: 403 }
      );
    }

    // Use admin client for the update
    const adminSupabase = createAdminClient();

    const updateData: {
      status: string;
      resolved_at?: string | null;
      duplicate_of?: string | null;
    } = { status };

    if (status === 'duplicate') {
      // --- Mark-as-duplicate: validate the canonical target -----------------
      if (!duplicateOfInput) {
        return NextResponse.json(
          { error: 'duplicate_of is required when marking a bug as duplicate' },
          { status: 400 }
        );
      }

      const { data: target, error: targetError } = await (
        adminSupabase.from('bug_reports') as any
      )
        .select('id, display_id, duplicate_of')
        .eq('id', duplicateOfInput)
        .maybeSingle();

      if (targetError || !target) {
        return NextResponse.json(
          { error: 'Canonical bug report not found' },
          { status: 404 }
        );
      }

      // Flatten chains: if the chosen target is itself a duplicate, point at
      // its canonical instead. Combined with the children-guard below this
      // makes cycles impossible (every duplicate points at a root canonical).
      const canonicalId: string = target.duplicate_of ?? target.id;

      if (canonicalId === reportId) {
        return NextResponse.json(
          { error: 'A bug report cannot be a duplicate of itself' },
          { status: 400 }
        );
      }

      const { count: childCount } = await (
        adminSupabase.from('bug_reports') as any
      )
        .select('id', { count: 'exact', head: true })
        .eq('duplicate_of', reportId);

      if ((childCount ?? 0) > 0) {
        return NextResponse.json(
          {
            error: `This bug has ${childCount} duplicate(s) pointing to it. Re-point or resolve them before marking it as a duplicate.`
          },
          { status: 400 }
        );
      }

      updateData.duplicate_of = canonicalId;
      updateData.resolved_at = null;
    } else if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
      // Keep duplicate_of on resolve so the group stays visible in history.
    } else {
      // Moving to an active status un-parks the bug: clear the duplicate link
      // and any stale resolution timestamp.
      updateData.duplicate_of = null;
      updateData.resolved_at = null;
    }

    const { data, error } = await (adminSupabase.from('bug_reports') as any)
      .update(updateData)
      .eq('id', reportId)
      .select()
      .single();

    if (error) throw error;

    if (status === 'duplicate') {
      // Leave a visible trail in both chat threads (non-blocking).
      void postDuplicateMessages(adminSupabase, user.id, data, updateData.duplicate_of!);
    }

    // Cascade + notifications (non-blocking — does not affect response)
    if (status === 'resolved') {
      void sendResolutionEmailAndLog(adminSupabase, reportId, data);
      void cascadeStatusToDuplicates(adminSupabase, reportId, 'resolved');
    } else if (status === 'wont_fix') {
      // Duplicates of a won't-fix canonical are the same issue — close them
      // too, silently (no "resolved" email for a wont_fix outcome).
      void cascadeStatusToDuplicates(adminSupabase, reportId, 'wont_fix');
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    logger.error('bug-reports/api', `Error updating report ${reportId}`, error);
    return NextResponse.json(
      { error: 'Failed to update bug report status.' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: when a canonical bug is closed, close every report parked as its
// duplicate. Resolved cascades also email each duplicate's reporter (reusing
// the same Resend service + email log used for the canonical's reporter).
// Runs after the response is returned — failures are logged, never thrown.
// ---------------------------------------------------------------------------
async function cascadeStatusToDuplicates(
  adminSupabase: ReturnType<typeof createAdminClient>,
  canonicalId: string,
  newStatus: 'resolved' | 'wont_fix'
): Promise<void> {
  try {
    const { data: children, error: childrenError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .select('id')
      .eq('duplicate_of', canonicalId)
      .eq('status', 'duplicate');

    if (childrenError || !children || children.length === 0) return;

    const childIds = children.map((c: any) => c.id);
    const cascadeData: { status: string; resolved_at: string | null } = {
      status: newStatus,
      resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null
    };

    const { error: cascadeError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .update(cascadeData)
      .in('id', childIds);

    if (cascadeError) {
      logger.error('bug-reports/api', 'Duplicate cascade update failed', cascadeError);
      return;
    }

    logger.info('bug-reports/api', 'Cascaded status to duplicates', {
      canonicalId,
      newStatus,
      count: childIds.length
    });

    if (newStatus !== 'resolved') return;

    // Notify every duplicate's reporter that their report is resolved.
    const { data: details } = await (
      adminSupabase.from('bug_reports_with_details') as any
    )
      .select(
        'id, display_id, reporter_email, reporter_name, description, page_url, institution_name, resolved_at'
      )
      .in('id', childIds);

    const emailDataList: BugResolvedEmailData[] = (details ?? [])
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

    if (emailDataList.length === 0) return;

    await BugReportEmailService.sendBulkResolvedEmails(emailDataList);

    await (adminSupabase as any).from('bug_report_email_logs').insert(
      emailDataList.map((r) => ({
        bug_report_id: r.reportId,
        recipient_email: r.reporterEmail,
        email_type: 'resolved_notification',
        status: 'sent'
      }))
    );
  } catch (err) {
    logger.error('bug-reports/api', 'Unexpected error in cascadeStatusToDuplicates', err);
  }
}

// ---------------------------------------------------------------------------
// Helper: leave a system chat message on both sides of a duplicate link so
// the reporter and the canonical thread both see what happened.
// ---------------------------------------------------------------------------
async function postDuplicateMessages(
  adminSupabase: ReturnType<typeof createAdminClient>,
  actorUserId: string,
  duplicateReport: any,
  canonicalId: string
): Promise<void> {
  try {
    const { data: canonical } = await (
      adminSupabase.from('bug_reports') as any
    )
      .select('display_id')
      .eq('id', canonicalId)
      .maybeSingle();

    await (adminSupabase as any).from('bug_report_messages').insert([
      {
        bug_report_id: duplicateReport.id,
        sender_user_id: actorUserId,
        message_text: `This report was marked as a duplicate of ${canonical?.display_id ?? 'another report'}. You'll be notified when the original is resolved.`,
        is_internal: false
      },
      {
        bug_report_id: canonicalId,
        sender_user_id: actorUserId,
        message_text: `${duplicateReport.display_id} was marked as a duplicate of this report.`,
        is_internal: false
      }
    ]);
  } catch (err) {
    // Chat trail is best-effort; the duplicate link itself already succeeded.
    logger.warn('bug-reports/api', 'Failed to post duplicate chat messages', err);
  }
}

// ---------------------------------------------------------------------------
// Helper: fetch reporter details, send email, log result
// Runs after the response is returned — failures are logged, never thrown.
// ---------------------------------------------------------------------------
async function sendResolutionEmailAndLog(
  adminSupabase: ReturnType<typeof createAdminClient>,
  reportId: string,
  updatedReport: any
): Promise<void> {
  try {
    // Fetch enriched report data (reporter email, name, institution)
    const { data: detail, error: detailError } = await (
      adminSupabase.from('bug_reports_with_details') as any
    )
      .select(
        'display_id, reporter_email, reporter_name, description, page_url, institution_name, resolved_at'
      )
      .eq('id', reportId)
      .single();

    if (detailError || !detail) {
      logger.warn('bug-reports/email', 'Could not fetch report details for email', { reportId });
      return;
    }

    if (!detail.reporter_email) {
      logger.warn('bug-reports/email', 'Reporter has no email — skipping notification', { reportId });
      return;
    }

    const emailData: BugResolvedEmailData = {
      reportId,
      displayId: detail.display_id,
      reporterEmail: detail.reporter_email,
      reporterName: detail.reporter_name,
      description: detail.description,
      pageUrl: detail.page_url,
      institutionName: detail.institution_name,
      resolvedAt: detail.resolved_at ?? updatedReport.resolved_at ?? new Date().toISOString()
    };

    const result = await BugReportEmailService.sendBugResolvedEmail(emailData);

    // Log the email send attempt to bug_report_email_logs
    await (adminSupabase as any).from('bug_report_email_logs').insert({
      bug_report_id: reportId,
      recipient_email: detail.reporter_email,
      email_type: 'resolved_notification',
      status: result.skipped ? 'skipped' : result.success ? 'sent' : 'failed',
      resend_id: result.resendId ?? null,
      error_message: result.error ?? result.skipReason ?? null
    });
  } catch (err) {
    logger.error('bug-reports/email', 'Unexpected error in sendResolutionEmailAndLog', err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
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
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || (!(profile as any).is_super_admin && profile.role !== 'super_admin')) {
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
            logger.error('bug-reports/api', 'Storage deletion error', storageError);
            // Continue with database deletion even if storage deletion fails
          }
        }
      } catch (error) {
        logger.error('bug-reports/api', 'Error parsing screenshot URL', error);
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

    return NextResponse.json({
      success: true,
      message: 'Bug report deleted successfully'
    });
  } catch (error) {
    logger.error('bug-reports/api', 'Failed to delete bug report', error);
    return NextResponse.json(
      { error: 'Failed to delete bug report' },
      { status: 500 }
    );
  }
}
