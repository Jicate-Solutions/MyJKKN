// =====================================================================
// Resolve-cascade helpers — the ONE path for what "resolved" means:
// resolution email to the canonical's reporter, cascade to duplicates
// (with their reporter emails), and the Learn-loop outcome snapshot.
// Extracted from app/api/bug-reports/[id]/route.ts (2026-07-19) so the
// nightly auto-resolve cron reuses EXACTLY the human-resolve path — an
// auto-resolve must never grow a second email/cascade implementation.
// =====================================================================
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  BugReportEmailService,
  type BugResolvedEmailData
} from '@/lib/services/email/bug-report-email-service';

export async function recordClusterOutcome(adminSupabase: any, reportId: string) {
  try {
    const { data: cluster } = await adminSupabase
      .from('bug_clusters')
      .select('id')
      .contains('member_ids', [reportId])
      .maybeSingle();
    if (!cluster?.id) return;
    await adminSupabase.rpc('fn_bug_fix_outcome_record', { p_cluster_id: cluster.id });
  } catch (e) {
    logger.warn('bug-reports/api', `outcome record skipped for ${reportId}`, e);
  }
}

export async function cascadeStatusToDuplicates(
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

export async function sendResolutionEmailAndLog(
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
