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
}
