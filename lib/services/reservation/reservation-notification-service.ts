// lib/services/reservation/reservation-notification-service.ts
//
// Thin wrappers around createNotification for the four reservation lifecycle
// events. Each function also fires a server-side email via the
// /api/resource-management/reservations/notify-email route so that
// RESEND_API_KEY never reaches the browser bundle.
//
// All callers must use fire-and-forget:
//   void notifyXxx(...).catch(console.error)
// so that a notification failure never blocks or rolls back a booking.

import { createNotification } from '@/lib/services/notification/notification-service';
import {
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel
} from '@/types/notification';
import type { Reservation } from '@/types/reservation';

// ---------------------------------------------------------------------------
// Internal helper — calls the server-side email API route fire-and-forget.
// The route handles fetching user emails and sending via Resend, keeping
// RESEND_API_KEY off the client bundle entirely.
// ---------------------------------------------------------------------------
async function fireEmailNotification(
  event: 'submitted' | 'approved' | 'rejected',
  reservationId: string,
  reason?: string
): Promise<void> {
  await fetch('/api/resource-management/reservations/notify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, reservation_id: reservationId, reason })
  });
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
  resourceName: string
): Promise<void> {
  await createNotification({
    user_id: reservation.user_id,
    type: NotificationType.INFO,
    category: NotificationCategory.RESERVATION,
    priority: NotificationPriority.NORMAL,
    title: `Booking Submitted – ${resourceName}`,
    message: `Your booking for "${resourceName}" on ${formatDate(reservation.start_time)} is pending approval.`,
    action_url: reservationUrl(reservation.id),
    action_label: 'View Booking',
    channels: [NotificationChannel.IN_APP]
  } as any);
  // Single email call handles both booker (pending) and approvers (action required).
  void fireEmailNotification('submitted', reservation.id).catch(console.error);
}

/** Notify each approver that a booking needs their review. */
export async function notifyApproversPendingBooking(
  approverIds: string[],
  reservation: Reservation,
  resourceName: string,
  requesterName: string
): Promise<void> {
  await Promise.all(
    approverIds.map((approverId) =>
      createNotification({
        user_id: approverId,
        type: NotificationType.WARNING,
        category: NotificationCategory.APPROVAL,
        priority: NotificationPriority.HIGH,
        title: `Approval Required – ${resourceName}`,
        message: `${requesterName} has requested "${resourceName}" on ${formatDate(reservation.start_time)}. Please review.`,
        action_url: reservationUrl(reservation.id),
        action_label: 'Review Booking',
        channels: [NotificationChannel.IN_APP]
      } as any)
    )
  );
}

/** Notify the booker that their reservation was approved. */
export async function notifyBookingApproved(
  reservation: Reservation,
  resourceName: string
): Promise<void> {
  await createNotification({
    user_id: reservation.user_id,
    type: NotificationType.SUCCESS,
    category: NotificationCategory.RESERVATION,
    priority: NotificationPriority.NORMAL,
    title: `Booking Confirmed – ${resourceName}`,
    message: `Your reservation for "${resourceName}" on ${formatDate(reservation.start_time)} has been approved.`,
    action_url: reservationUrl(reservation.id),
    action_label: 'View Booking',
    channels: [NotificationChannel.IN_APP]
  } as any);
  void fireEmailNotification('approved', reservation.id).catch(console.error);
}

/** Notify the booker that their reservation was rejected. */
export async function notifyBookingRejected(
  reservation: Reservation,
  resourceName: string,
  reason: string
): Promise<void> {
  await createNotification({
    user_id: reservation.user_id,
    type: NotificationType.ERROR,
    category: NotificationCategory.RESERVATION,
    priority: NotificationPriority.HIGH,
    title: `Booking Declined – ${resourceName}`,
    message: `Your reservation for "${resourceName}" on ${formatDate(reservation.start_time)} was declined. Reason: ${reason || 'No reason provided'}.`,
    action_url: reservationUrl(reservation.id),
    action_label: 'View Booking',
    channels: [NotificationChannel.IN_APP]
  } as any);
  void fireEmailNotification('rejected', reservation.id, reason).catch(console.error);
}
