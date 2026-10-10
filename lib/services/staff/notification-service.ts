/**
 * lib/services/staff/notification-service.ts
 *
 * Static-class wrapper for dispatching in-app notifications to staff members.
 * Uses the shared notifications + user_notifications tables (same pattern as work-pulse).
 *
 * This service is SERVER-SIDE ONLY — it requires a service-role Supabase client.
 * Never import it in client components or hooks; call /api/staff/notify instead.
 *
 * Added: 2026-04-16 — Staff Notifications Sprint
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffEventType } from '@/types/staff';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaffNotificationPayload {
  title: string;
  message: string;
  userIds: string[];
  eventType: StaffEventType;
  metadata?: Record<string, unknown>;
  /** Deep-link the bell click navigates to (e.g. /hr/leave/<id>). Falls back to
   *  the notifications inbox when omitted. */
  url?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class StaffNotificationService {
  /**
   * Insert a single notification row and link it to every recipient.
   * Returns the number of users notified (0 if userIds is empty or insert fails).
   *
   * @param supabase   Service-role client — bypasses RLS
   * @param payload    Notification content + target user ids
   */
  static async dispatch(
    supabase: SupabaseClient,
    payload: StaffNotificationPayload
  ): Promise<number> {
    const { title, message, userIds, eventType, metadata = {}, url } = payload;

    if (userIds.length === 0) return 0;

    // 1. Insert notification row.
    // The notifications table has NO `type`/`message` columns: the body column
    // is `body`, and `created_by` + `targeting` are NOT NULL. The prior shape
    // (type + message, no created_by/targeting) threw on EVERY call, so staff
    // notifications silently produced zero rows — leave submit/approve/reject
    // never reached anyone (only the 48h escalation cron did). Fixed 2026-07-27.
    // `created_by` is set to a recipient (these are system-authored; mirrors the
    // cron COALESCE-to-recipient pattern for the NOT NULL column), and
    // `kind:'work_item'` keeps them out of the announcements admin page while the
    // bell (which reads user_notifications) still surfaces them.
    const { data: notification, error: insertErr } = await supabase
      .from('notifications')
      .insert({
        title,
        body: message,
        created_by: userIds[0],
        targeting: { type: 'user', user_ids: userIds },
        category: 'staff',
        kind: 'work_item',
        url: url ?? null,
        metadata: {
          source: 'staff_notify',
          event_type: eventType,
          ...metadata,
        },
      })
      .select('id')
      .single();

    if (insertErr || !notification) {
      console.error('[staff/notification-service] Insert failed:', insertErr);
      return 0;
    }

    // 2. Fan out to all recipients via user_notifications
    const links = userIds.map((uid) => ({
      notification_id: notification.id,
      user_id: uid,
    }));

    const { error: linkErr } = await supabase.from('user_notifications').insert(links);

    if (linkErr) {
      console.error('[staff/notification-service] user_notifications insert failed:', linkErr);
      // Notification row exists but links failed — still return 0 so caller can retry
      return 0;
    }

    return userIds.length;
  }

  // ---------------------------------------------------------------------------
  // Convenience wrappers for each event type
  // ---------------------------------------------------------------------------

  /**
   * leave_submitted → notify the first pending approver in the approval chain.
   * @param supabase        Service-role client
   * @param applicationId   hr_leave_applications.id
   * @param approverUserIds User IDs of all approvers at the current chain step
   * @param staffName       Requester's display name (for the notification body)
   * @param leaveTypeName   E.g. "Casual Leave"
   * @param dateRange       E.g. "2026-04-20 → 2026-04-22"
   */
  static async notifyLeaveSubmitted(
    supabase: SupabaseClient,
    applicationId: string,
    approverUserIds: string[],
    staffName: string,
    leaveTypeName: string,
    dateRange: string
  ): Promise<number> {
    return this.dispatch(supabase, {
      title: 'New Leave Request Awaiting Approval',
      message: `${staffName} has submitted a ${leaveTypeName} request for ${dateRange}. Please review and decide.`,
      userIds: approverUserIds,
      eventType: 'leave_submitted',
      url: `/hr/leave/${applicationId}`,
      metadata: { reference_id: applicationId, staff_name: staffName, leave_type: leaveTypeName },
    });
  }

  /**
   * leave_approved → notify the applicant.
   */
  static async notifyLeaveApproved(
    supabase: SupabaseClient,
    applicationId: string,
    applicantUserId: string,
    leaveTypeName: string,
    dateRange: string,
    approverName?: string
  ): Promise<number> {
    const by = approverName ? ` by ${approverName}` : '';
    return this.dispatch(supabase, {
      title: 'Leave Request Approved',
      message: `Your ${leaveTypeName} request for ${dateRange} has been approved${by}.`,
      userIds: [applicantUserId],
      eventType: 'leave_approved',
      url: `/hr/leave/${applicationId}`,
      metadata: { reference_id: applicationId, leave_type: leaveTypeName },
    });
  }

  /**
   * leave_rejected → notify the applicant.
   */
  static async notifyLeaveRejected(
    supabase: SupabaseClient,
    applicationId: string,
    applicantUserId: string,
    leaveTypeName: string,
    dateRange: string,
    rejectionReason?: string
  ): Promise<number> {
    const reason = rejectionReason ? ` Reason: ${rejectionReason}` : '';
    return this.dispatch(supabase, {
      title: 'Leave Request Rejected',
      message: `Your ${leaveTypeName} request for ${dateRange} has been rejected.${reason}`,
      userIds: [applicantUserId],
      eventType: 'leave_rejected',
      url: `/hr/leave/${applicationId}`,
      metadata: {
        reference_id: applicationId,
        leave_type: leaveTypeName,
        rejection_reason: rejectionReason,
      },
    });
  }

  /**
   * leave_revoked → notify the applicant that an APPROVED request was taken back.
   *
   * Deliberately not notifyLeaveRejected with different words: the applicant had
   * an approved leave and has now lost it, usually after planning around it. The
   * wording has to say that, and a distinct event_type lets a later digest or
   * filter tell the two apart.
   */
  static async notifyLeaveRevoked(
    supabase: SupabaseClient,
    applicationId: string,
    applicantUserId: string,
    leaveTypeName: string,
    dateRange: string,
    reason: string,
    revokedByName?: string
  ): Promise<number> {
    const by = revokedByName ? ` by ${revokedByName}` : '';
    return this.dispatch(supabase, {
      title: 'Approved Leave Revoked',
      message: `Your ${leaveTypeName} for ${dateRange} was approved and has now been revoked${by}. Reason: ${reason}`,
      userIds: [applicantUserId],
      eventType: 'leave_revoked',
      url: `/hr/leave/${applicationId}`,
      metadata: {
        reference_id: applicationId,
        leave_type: leaveTypeName,
        revoke_reason: reason,
        revoked_by: revokedByName,
      },
    });
  }

  /**
   * eligibility_submitted → notify everyone on the current step of an
   * eligibility request for a gated leave type (2026-09-21).
   *
   * Deep-links to the Eligibility page rather than a per-row page: that page
   * IS the approver's queue, and there is no detail route for one request.
   */
  static async notifyEligibilitySubmitted(
    supabase: SupabaseClient,
    eligibilityId: string,
    approverUserIds: string[],
    staffName: string,
    leaveTypeName: string
  ): Promise<number> {
    return this.dispatch(supabase, {
      title: 'Leave Eligibility Request Awaiting Approval',
      message: `${staffName} has requested eligibility for ${leaveTypeName} and attached the supporting document. Please review and decide.`,
      userIds: approverUserIds,
      eventType: 'eligibility_submitted',
      url: '/hr/leave/eligibility',
      metadata: { reference_id: eligibilityId, staff_name: staffName, leave_type: leaveTypeName },
    });
  }

  /**
   * eligibility_approved | eligibility_rejected → notify the requester.
   *
   * Links to Apply Leave either way: on approval the type is now in their
   * picker, on rejection the "Request again" control sits under it.
   */
  static async notifyEligibilityDecided(
    supabase: SupabaseClient,
    eligibilityId: string,
    applicantUserId: string,
    leaveTypeName: string,
    approved: boolean,
    note?: string | null
  ): Promise<number> {
    const tail = note ? ` Note: ${note}` : '';
    return this.dispatch(supabase, {
      title: approved ? 'Leave Eligibility Approved' : 'Leave Eligibility Rejected',
      message: approved
        ? `You are now eligible for ${leaveTypeName}. It now appears in your Apply Leave list.${tail}`
        : `Your eligibility request for ${leaveTypeName} was not approved.${tail} You can request again with the document asked for.`,
      userIds: [applicantUserId],
      eventType: approved ? 'eligibility_approved' : 'eligibility_rejected',
      url: '/hr/leave/apply',
      metadata: {
        reference_id: eligibilityId,
        leave_type: leaveTypeName,
        decision_note: note ?? undefined,
      },
    });
  }

  /**
   * schedule_assigned → notify the staff member assigned to a new shift/class.
   */
  static async notifyScheduleAssigned(
    supabase: SupabaseClient,
    scheduleId: string,
    staffUserIds: string[],
    sectionOrShiftName: string,
    effectiveDate: string
  ): Promise<number> {
    return this.dispatch(supabase, {
      title: 'New Schedule Assignment',
      message: `You have been assigned to "${sectionOrShiftName}" effective ${effectiveDate}. Check your timetable for details.`,
      userIds: staffUserIds,
      eventType: 'schedule_assigned',
      metadata: { reference_id: scheduleId, section_name: sectionOrShiftName, effective_date: effectiveDate },
    });
  }

  /**
   * onboarding_step_pending → notify the staff member that an onboarding step is waiting for them.
   */
  static async notifyOnboardingStepPending(
    supabase: SupabaseClient,
    candidateId: string,
    staffUserId: string,
    stepName: string,
    checklistName: string
  ): Promise<number> {
    return this.dispatch(supabase, {
      title: 'Onboarding Step Pending',
      message: `Action required: "${stepName}" in your onboarding checklist "${checklistName}" is awaiting completion.`,
      userIds: [staffUserId],
      eventType: 'onboarding_step_pending',
      metadata: { reference_id: candidateId, step_name: stepName, checklist_name: checklistName },
    });
  }

  // ---------------------------------------------------------------------------
  // HR staff harness (2026-10-01) — duty R9, the onboarding checklist.
  // Recipients are the step's OWNERS (pinned person, or holders of the step's
  // role), not the joiner. Every message names the joiner, the step and the
  // joining date, and links to the candidate page where the step is ticked.
  // ---------------------------------------------------------------------------

  /** onboarding_step_turn → a step has become its owner's turn. */
  static async notifyOnboardingStepTurn(
    supabase: SupabaseClient,
    candidateId: string,
    ownerUserIds: string[],
    args: {
      candidateName: string;
      roleTitle: string;
      stepName: string;
      stepNumber: number;
      stepCount: number;
      joiningDate: string | null;
      previousStepName?: string | null;
    }
  ): Promise<number> {
    const joining = args.joiningDate ? ` Joining date: ${args.joiningDate}.` : '';
    const after = args.previousStepName ? ` "${args.previousStepName}" is done, so` : '';
    return this.dispatch(supabase, {
      title: `Onboarding step ${args.stepNumber} of ${args.stepCount} is yours`,
      message: `${args.candidateName} (${args.roleTitle}):${after} "${args.stepName}" is now with you.${joining} Tick it on the candidate page when it is done.`,
      userIds: ownerUserIds,
      eventType: 'onboarding_step_turn',
      url: `/hr/recruitment/candidates/${candidateId}`,
      metadata: {
        reference_id: candidateId,
        step_name: args.stepName,
        step_number: args.stepNumber,
        joining_date: args.joiningDate,
      },
    });
  }

  /** onboarding_step_reminder → one reminder to the step's owner(s). */
  static async notifyOnboardingStepReminder(
    supabase: SupabaseClient,
    candidateId: string,
    ownerUserIds: string[],
    args: {
      candidateName: string;
      roleTitle: string;
      stepName: string;
      stepNumber: number;
      stepCount: number;
      joiningDate: string | null;
      reason: 'held_too_long' | 'joining_soon';
      workingDaysHeld?: number;
    }
  ): Promise<number> {
    const why =
      args.reason === 'joining_soon'
        ? `${args.candidateName} joins on ${args.joiningDate} and this step is still open.`
        : `This step has been with you for ${args.workingDaysHeld ?? 'more than 2'} working days.`;
    return this.dispatch(supabase, {
      title: `Reminder: onboarding step ${args.stepNumber} of ${args.stepCount} for ${args.candidateName}`,
      message: `"${args.stepName}" for ${args.candidateName} (${args.roleTitle}). ${why} Tick it on the candidate page once it is done.`,
      userIds: ownerUserIds,
      eventType: 'onboarding_step_reminder',
      url: `/hr/recruitment/candidates/${candidateId}`,
      metadata: {
        reference_id: candidateId,
        step_name: args.stepName,
        step_number: args.stepNumber,
        joining_date: args.joiningDate,
        reason: args.reason,
      },
    });
  }

  /**
   * onboarding_joining_soon → one notice per joiner, to the owners of every
   * open step, once the joining date is close. Lists the open steps.
   */
  static async notifyOnboardingJoiningSoon(
    supabase: SupabaseClient,
    candidateId: string,
    ownerUserIds: string[],
    args: {
      candidateName: string;
      roleTitle: string;
      joiningDate: string;
      openSteps: string[];
    }
  ): Promise<number> {
    const list = args.openSteps.slice(0, 5).map((s) => `"${s}"`).join(', ');
    const more = args.openSteps.length > 5 ? ` and ${args.openSteps.length - 5} more` : '';
    return this.dispatch(supabase, {
      title: `Reminder: ${args.candidateName} joins on ${args.joiningDate}`,
      message: `${args.candidateName} (${args.roleTitle}) joins on ${args.joiningDate} and ${args.openSteps.length} onboarding step(s) are still open: ${list}${more}. If one of them is yours, tick it on the candidate page once it is done.`,
      userIds: ownerUserIds,
      eventType: 'onboarding_joining_soon',
      url: `/hr/recruitment/candidates/${candidateId}`,
      metadata: {
        reference_id: candidateId,
        joining_date: args.joiningDate,
        open_steps: args.openSteps,
        reason: 'joining_soon',
      },
    });
  }

  /** onboarding_joining_passed → one notice to the HR head. */
  static async notifyOnboardingJoiningPassed(
    supabase: SupabaseClient,
    candidateId: string,
    hrHeadUserIds: string[],
    args: {
      candidateName: string;
      roleTitle: string;
      joiningDate: string;
      openSteps: string[];
    }
  ): Promise<number> {
    const list = args.openSteps.slice(0, 5).map((s) => `"${s}"`).join(', ');
    const more = args.openSteps.length > 5 ? ` and ${args.openSteps.length - 5} more` : '';
    return this.dispatch(supabase, {
      title: `Joining date passed with onboarding open: ${args.candidateName}`,
      message: `${args.candidateName} (${args.roleTitle}) was due to join on ${args.joiningDate}. ${args.openSteps.length} onboarding step(s) are still open: ${list}${more}. The team member record cannot be created until every step is done.`,
      userIds: hrHeadUserIds,
      eventType: 'onboarding_joining_passed',
      url: `/hr/recruitment/candidates/${candidateId}`,
      metadata: {
        reference_id: candidateId,
        joining_date: args.joiningDate,
        open_steps: args.openSteps,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // HR staff harness (2026-10-01) — duty A3, attendance regularisation.
  // Approvers are the holders of hr.attendance.regularize_approve /
  // hr.attendance.approve_team — the same keys the approvals screen and its
  // RLS read. The requester is the staff member the request is for.
  // ---------------------------------------------------------------------------

  /** regularization_submitted → the approvers. */
  static async notifyRegularizationSubmitted(
    supabase: SupabaseClient,
    regularizationId: string,
    approverUserIds: string[],
    args: { staffName: string; forDate: string; reason: string; waitingDays: number }
  ): Promise<number> {
    const waiting =
      args.waitingDays >= 1 ? ` It has been waiting ${args.waitingDays} day(s).` : '';
    return this.dispatch(supabase, {
      title: 'Attendance Regularisation Awaiting Approval',
      message: `${args.staffName} asked to correct their attendance for ${args.forDate}. Reason: ${args.reason}.${waiting} Please approve or reject it.`,
      userIds: approverUserIds,
      eventType: 'regularization_submitted',
      url: '/hr/attendance/regularize/approvals',
      metadata: { reference_id: regularizationId, staff_name: args.staffName, for_date: args.forDate },
    });
  }

  /** regularization_reminder → the approvers, once. */
  static async notifyRegularizationReminder(
    supabase: SupabaseClient,
    regularizationId: string,
    approverUserIds: string[],
    args: { staffName: string; forDate: string; reason: string; waitingDays: number }
  ): Promise<number> {
    return this.dispatch(supabase, {
      title: 'Reminder: Attendance Regularisation Still Waiting',
      message: `${args.staffName}'s request to correct ${args.forDate} has waited ${args.waitingDays} day(s). Reason: ${args.reason}. Once the month is closed it cannot be approved without reopening the month.`,
      userIds: approverUserIds,
      eventType: 'regularization_reminder',
      url: '/hr/attendance/regularize/approvals',
      metadata: { reference_id: regularizationId, staff_name: args.staffName, for_date: args.forDate },
    });
  }

  /** regularization_hr_head → the HR head, once. */
  static async notifyRegularizationHrHead(
    supabase: SupabaseClient,
    regularizationId: string,
    hrHeadUserIds: string[],
    args: { staffName: string; forDate: string; waitingDays: number; monthClosed: boolean }
  ): Promise<number> {
    const month = args.monthClosed
      ? ' Its month is already closed, so it can only be approved after the month is reopened.'
      : ' Decide it before the month is closed, or it will need the month reopened.';
    return this.dispatch(supabase, {
      title: 'Attendance Regularisation Undecided for Days',
      message: `${args.staffName}'s request to correct ${args.forDate} has had no decision for ${args.waitingDays} day(s).${month}`,
      userIds: hrHeadUserIds,
      eventType: 'regularization_hr_head',
      url: '/hr/attendance/regularize/approvals',
      metadata: {
        reference_id: regularizationId,
        staff_name: args.staffName,
        for_date: args.forDate,
        month_closed: args.monthClosed,
      },
    });
  }

  /** regularization_approved | regularization_rejected → the requester. */
  static async notifyRegularizationDecided(
    supabase: SupabaseClient,
    regularizationId: string,
    requesterUserId: string,
    args: { forDate: string; approved: boolean; rejectionReason?: string | null }
  ): Promise<number> {
    const reason = args.rejectionReason ? ` Reason: ${args.rejectionReason}` : '';
    return this.dispatch(supabase, {
      title: args.approved
        ? 'Attendance Regularisation Approved'
        : 'Attendance Regularisation Rejected',
      message: args.approved
        ? `Your request to correct your attendance for ${args.forDate} was approved. The day now shows as regularised in My Attendance.`
        : `Your request to correct your attendance for ${args.forDate} was rejected.${reason}`,
      userIds: [requesterUserId],
      eventType: args.approved ? 'regularization_approved' : 'regularization_rejected',
      url: '/hr/attendance',
      metadata: {
        reference_id: regularizationId,
        for_date: args.forDate,
        rejection_reason: args.rejectionReason ?? undefined,
      },
    });
  }
}
