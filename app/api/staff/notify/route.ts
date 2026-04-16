/**
 * POST /api/staff/notify?type=<StaffEventType>
 *
 * Server route for in-app notifications on staff-facing events.
 * Auth: x-api-key header only (same pattern as /api/work-pulse/notify).
 *
 * Event handlers:
 *   leave_submitted        — notify approver(s) when a leave request is submitted
 *   leave_approved         — notify requester when their leave is approved
 *   leave_rejected         — notify requester when their leave is rejected
 *   schedule_assigned      — notify staff when assigned to a section/shift
 *   onboarding_step_pending — notify a new hire when an onboarding step is assigned
 *
 * Request body (JSON):
 *   For leave events:
 *     { application_id: string, context?: object }
 *   For schedule_assigned:
 *     { schedule_id: string, staff_user_ids: string[], section_name: string, effective_date: string }
 *   For onboarding_step_pending:
 *     { candidate_id: string, staff_user_id: string, step_name: string, checklist_name: string }
 *
 * Added: 2026-04-16 — Staff Notifications Sprint
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { StaffNotificationService } from '@/lib/services/staff/notification-service';
import type { StaffEventType } from '@/types/staff';

const VALID_API_KEY = process.env.STAFF_NOTIFY_API_KEY;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  await connection();

  // Auth: x-api-key only
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== VALID_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') as StaffEventType | null;

  if (!type) {
    return NextResponse.json({ error: 'Missing ?type= parameter' }, { status: 400 });
  }

  const validTypes: StaffEventType[] = [
    'leave_submitted',
    'leave_approved',
    'leave_rejected',
    'schedule_assigned',
    'onboarding_step_pending',
  ];

  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // body is optional for some events — ignore parse errors
  }

  try {
    const supabase = createServiceRoleClient();

    switch (type) {
      case 'leave_submitted':
        return await handleLeaveSubmitted(supabase, body);

      case 'leave_approved':
        return await handleLeaveDecision(supabase, body, 'leave_approved');

      case 'leave_rejected':
        return await handleLeaveDecision(supabase, body, 'leave_rejected');

      case 'schedule_assigned':
        return await handleScheduleAssigned(supabase, body);

      case 'onboarding_step_pending':
        return await handleOnboardingStepPending(supabase, body);

      default:
        return NextResponse.json({ error: `Unhandled type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error(`[staff/notify/${type}]`, error);
    return NextResponse.json(
      { error: 'Notification failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Handler: leave_submitted
// Looks up the application, resolves approver user IDs from the approval chain,
// and sends a notification to each approver.
// ---------------------------------------------------------------------------

async function handleLeaveSubmitted(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: Record<string, unknown>
) {
  const applicationId = body.application_id as string | undefined;
  if (!applicationId) {
    return NextResponse.json({ error: 'Missing application_id' }, { status: 400 });
  }

  // Fetch the leave application
  const { data: app, error: appErr } = await supabase
    .from('hr_leave_applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle();

  if (appErr) throw appErr;
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  // Resolve approver user IDs at the current chain step
  // The chain stores approver_user_id if set at apply-time, else we look up by role
  const chain: Array<{
    step_order: number;
    approver_role?: string;
    approver_user_id?: string | null;
    status: string;
  }> = Array.isArray(app.approval_chain) ? app.approval_chain : [];

  const currentStep = chain[app.current_step ?? 0];
  let approverUserIds: string[] = [];

  if (currentStep?.approver_user_id) {
    approverUserIds = [currentStep.approver_user_id];
  } else if (currentStep?.approver_role) {
    // Look up profiles by role within the same institution
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', currentStep.approver_role)
      .eq('is_active', true);
    approverUserIds = (profiles ?? []).map((p: { id: string }) => p.id);
  }

  if (approverUserIds.length === 0) {
    return NextResponse.json({ type: 'leave_submitted', notified: 0, reason: 'no_approvers_resolved' });
  }

  // Resolve staff display name
  const { data: staffRow } = await supabase
    .from('staff')
    .select('first_name, last_name')
    .eq('id', app.employee_id)
    .maybeSingle();

  const staffName = staffRow
    ? `${staffRow.first_name}${staffRow.last_name ? ' ' + staffRow.last_name : ''}`
    : 'A staff member';

  // Resolve leave type name
  const { data: leaveType } = await supabase
    .from('leave_types')
    .select('leave_type_name')
    .eq('id', app.leave_type_id)
    .maybeSingle();

  const leaveTypeName: string =
    (leaveType as { leave_type_name?: string } | null)?.leave_type_name ?? 'Leave';
  const dateRange = `${app.start_date} → ${app.end_date}`;

  const notified = await StaffNotificationService.notifyLeaveSubmitted(
    supabase,
    applicationId,
    approverUserIds,
    staffName,
    leaveTypeName,
    dateRange
  );

  return NextResponse.json({ type: 'leave_submitted', notified });
}

// ---------------------------------------------------------------------------
// Handler: leave_approved | leave_rejected
// Looks up the application, resolves the applicant's user ID (applied_by),
// and sends the appropriate notification.
// ---------------------------------------------------------------------------

async function handleLeaveDecision(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: Record<string, unknown>,
  eventType: 'leave_approved' | 'leave_rejected'
) {
  const applicationId = body.application_id as string | undefined;
  if (!applicationId) {
    return NextResponse.json({ error: 'Missing application_id' }, { status: 400 });
  }

  const { data: app, error: appErr } = await supabase
    .from('hr_leave_applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle();

  if (appErr) throw appErr;
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  // applied_by is the auth user ID of the person who submitted the leave
  const applicantUserId: string = app.applied_by;

  // Resolve leave type name
  const { data: leaveType } = await supabase
    .from('leave_types')
    .select('leave_type_name')
    .eq('id', app.leave_type_id)
    .maybeSingle();

  const leaveTypeName: string =
    (leaveType as { leave_type_name?: string } | null)?.leave_type_name ?? 'Leave';
  const dateRange = `${app.start_date} → ${app.end_date}`;

  let notified: number;

  if (eventType === 'leave_approved') {
    // Resolve approver's display name
    let approverName: string | undefined;
    if (app.final_approver_id) {
      const { data: approverProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', app.final_approver_id)
        .maybeSingle();
      approverName = (approverProfile as { full_name?: string } | null)?.full_name;
    }

    notified = await StaffNotificationService.notifyLeaveApproved(
      supabase,
      applicationId,
      applicantUserId,
      leaveTypeName,
      dateRange,
      approverName
    );
  } else {
    notified = await StaffNotificationService.notifyLeaveRejected(
      supabase,
      applicationId,
      applicantUserId,
      leaveTypeName,
      dateRange,
      app.rejection_reason ?? undefined
    );
  }

  return NextResponse.json({ type: eventType, notified });
}

// ---------------------------------------------------------------------------
// Handler: schedule_assigned
// Body: { schedule_id, staff_user_ids, section_name, effective_date }
// ---------------------------------------------------------------------------

async function handleScheduleAssigned(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: Record<string, unknown>
) {
  const scheduleId = body.schedule_id as string | undefined;
  const staffUserIds = body.staff_user_ids as string[] | undefined;
  const sectionName = (body.section_name as string | undefined) ?? 'a new section';
  const effectiveDate = (body.effective_date as string | undefined) ?? new Date().toISOString().split('T')[0];

  if (!scheduleId) {
    return NextResponse.json({ error: 'Missing schedule_id' }, { status: 400 });
  }
  if (!Array.isArray(staffUserIds) || staffUserIds.length === 0) {
    return NextResponse.json({ error: 'Missing or empty staff_user_ids' }, { status: 400 });
  }

  const notified = await StaffNotificationService.notifyScheduleAssigned(
    supabase,
    scheduleId,
    staffUserIds,
    sectionName,
    effectiveDate
  );

  return NextResponse.json({ type: 'schedule_assigned', notified });
}

// ---------------------------------------------------------------------------
// Handler: onboarding_step_pending
// Body: { candidate_id, staff_user_id, step_name, checklist_name }
// If staff_user_id is absent, it resolves the linked auth user via
// hr_recruitment_candidates.user_profile_id or falls back to employee email lookup.
// ---------------------------------------------------------------------------

async function handleOnboardingStepPending(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: Record<string, unknown>
) {
  const candidateId = body.candidate_id as string | undefined;
  const stepName = (body.step_name as string | undefined) ?? 'Onboarding step';
  const checklistName = (body.checklist_name as string | undefined) ?? 'Onboarding Checklist';

  if (!candidateId) {
    return NextResponse.json({ error: 'Missing candidate_id' }, { status: 400 });
  }

  // Resolve staff_user_id — may be provided directly, or we look it up via candidate
  let staffUserId = body.staff_user_id as string | undefined;

  if (!staffUserId) {
    // Try to resolve via hr_recruitment_candidates → user_profile_id or email
    const { data: candidate } = await supabase
      .from('hr_recruitment_candidates')
      .select('user_profile_id, email')
      .eq('id', candidateId)
      .maybeSingle();

    if (candidate?.user_profile_id) {
      staffUserId = candidate.user_profile_id;
    } else if (candidate?.email) {
      // Look up auth user by email via profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', candidate.email)
        .maybeSingle();
      staffUserId = profile?.id;
    }
  }

  if (!staffUserId) {
    return NextResponse.json({
      type: 'onboarding_step_pending',
      notified: 0,
      reason: 'staff_user_id_not_resolved',
    });
  }

  const notified = await StaffNotificationService.notifyOnboardingStepPending(
    supabase,
    candidateId,
    staffUserId,
    stepName,
    checklistName
  );

  return NextResponse.json({ type: 'onboarding_step_pending', notified });
}
