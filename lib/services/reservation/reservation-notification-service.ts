// lib/services/reservation/reservation-notification-service.ts
//
// Thin wrappers around createNotification for the reservation lifecycle
// events (submitted / approvers-pending / approved / rejected / cancelled).
//
// BUG-004009: these used to run IN THE BROWSER under the booker's own
// permissions. The `notifications` INSERT policy admits only super admins and
// admins, so every write by ordinary staff or a learner failed with 42501 and
// the fire-and-forget callers hid it — approvers never saw "Approval Required"
// and requesters never saw the outcome.
//
// They now run server-side from
//   POST /api/resource-management/reservations/notify
// which authenticates the caller, checks they may raise that event for that
// reservation, and passes its SERVICE-ROLE client in via `opts.client`. The
// browser never calls these directly any more — ReservationService posts the
// event to the route instead (see ReservationService.dispatchNotification).
//
// Email for the same events is dispatched by the sibling
// /api/resource-management/reservations/notify-email route, also posted to by
// ReservationService, so RESEND_API_KEY never reaches the browser bundle.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/services/notification/notification-service';
import {
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel
} from '@/types/notification';
import type { Reservation } from '@/types/reservation';

/**
 * Who is writing, and with which client. `client` MUST be the service-role
 * client when the caller is not an admin — see the header comment. `actorId`
 * becomes `notifications.created_by` (falls back to the recipient when absent).
 */
export interface NotifyOptions {
  client?: SupabaseClient;
  actorId?: string;
}

function reservationUrl(reservationId: string) {
  return `/resource-management/reservations/${reservationId}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

/** Notify the booker that their booking is pending approval. */
export async function notifyBookingSubmitted(
  reservation: Reservation,
  resourceName: string,
  opts: NotifyOptions = {}
): Promise<void> {
  await createNotification(
    {
      user_id: reservation.user_id,
      type: NotificationType.INFO,
      category: NotificationCategory.RESERVATION,
      priority: NotificationPriority.NORMAL,
      title: `Booking Submitted – ${resourceName}`,
      message: `Your booking for "${resourceName}" on ${formatDate(reservation.start_time)} is pending approval.`,
      action_url: reservationUrl(reservation.id),
      action_label: 'View Booking',
      channels: [NotificationChannel.IN_APP]
    } as any,
    opts.actorId,
    opts.client
  );
}

/** Notify each approver that a booking needs their review. */
export async function notifyApproversPendingBooking(
  approverIds: string[],
  reservation: Reservation,
  resourceName: string,
  requesterName: string,
  opts: NotifyOptions = {}
): Promise<void> {
  await Promise.all(
    approverIds.map((approverId) =>
      createNotification(
        {
          user_id: approverId,
          type: NotificationType.WARNING,
          category: NotificationCategory.APPROVAL,
          priority: NotificationPriority.HIGH,
          title: `Approval Required – ${resourceName}`,
          message: `${requesterName} has requested "${resourceName}" on ${formatDate(reservation.start_time)}. Please review.`,
          action_url: reservationUrl(reservation.id),
          action_label: 'Review Booking',
          channels: [NotificationChannel.IN_APP]
        } as any,
        opts.actorId,
        opts.client
      )
    )
  );
}

/** Notify the booker that their reservation was approved. */
export async function notifyBookingApproved(
  reservation: Reservation,
  resourceName: string,
  opts: NotifyOptions = {}
): Promise<void> {
  await createNotification(
    {
      user_id: reservation.user_id,
      type: NotificationType.SUCCESS,
      category: NotificationCategory.RESERVATION,
      priority: NotificationPriority.NORMAL,
      title: `Booking Confirmed – ${resourceName}`,
      message: `Your reservation for "${resourceName}" on ${formatDate(reservation.start_time)} has been approved.`,
      action_url: reservationUrl(reservation.id),
      action_label: 'View Booking',
      channels: [NotificationChannel.IN_APP]
    } as any,
    opts.actorId,
    opts.client
  );
}

/** Notify the booker that their reservation was rejected. */
export async function notifyBookingRejected(
  reservation: Reservation,
  resourceName: string,
  reason: string,
  opts: NotifyOptions = {}
): Promise<void> {
  await createNotification(
    {
      user_id: reservation.user_id,
      type: NotificationType.ERROR,
      category: NotificationCategory.RESERVATION,
      priority: NotificationPriority.HIGH,
      title: `Booking Declined – ${resourceName}`,
      message: `Your reservation for "${resourceName}" on ${formatDate(reservation.start_time)} was declined. Reason: ${reason || 'No reason provided'}.`,
      action_url: reservationUrl(reservation.id),
      action_label: 'View Booking',
      channels: [NotificationChannel.IN_APP]
    } as any,
    opts.actorId,
    opts.client
  );
}

/**
 * Notify the booker that their reservation was cancelled, and — when it had
 * already been approved — each approver who signed it off, so a freed slot is
 * visible to the people who granted it.
 */
export async function notifyBookingCancelled(
  reservation: Reservation,
  resourceName: string,
  approverIds: string[],
  requesterName: string,
  opts: NotifyOptions = {}
): Promise<void> {
  const when = formatDate(reservation.start_time);
  const reason = reservation.cancellation_reason;

  const requester = createNotification(
    {
      user_id: reservation.user_id,
      type: NotificationType.INFO,
      category: NotificationCategory.RESERVATION,
      priority: NotificationPriority.NORMAL,
      title: `Booking Cancelled – ${resourceName}`,
      message: `Your reservation for "${resourceName}" on ${when} has been cancelled${reason ? `. Reason: ${reason}` : ''}.`,
      action_url: reservationUrl(reservation.id),
      action_label: 'View Booking',
      channels: [NotificationChannel.IN_APP]
    } as any,
    opts.actorId,
    opts.client
  );

  const approvers = approverIds.map((approverId) =>
    createNotification(
      {
        user_id: approverId,
        type: NotificationType.INFO,
        category: NotificationCategory.RESERVATION,
        priority: NotificationPriority.NORMAL,
        title: `Booking Cancelled – ${resourceName}`,
        message: `${requesterName} has cancelled the approved reservation for "${resourceName}" on ${when}${reason ? `. Reason: ${reason}` : ''}.`,
        action_url: reservationUrl(reservation.id),
        action_label: 'View Booking',
        channels: [NotificationChannel.IN_APP]
      } as any,
      opts.actorId,
      opts.client
    )
  );

  await Promise.all([requester, ...approvers]);
}
