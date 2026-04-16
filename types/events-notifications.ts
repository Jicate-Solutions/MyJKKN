// types/events-notifications.ts
// Notification types for the Events module (marathon + future event types).
// DO NOT import from or modify types/notification.ts.

// ============================================================================
// Event Notification Event Types
// ============================================================================

/**
 * All notification trigger points in the Events / Marathon module.
 *
 * Cron-pollable types:
 *   event_reminder_24h  — fires 24 h before event_date
 *   event_reminder_1h   — fires  1 h before event_date
 *
 * Real-time (event-driven) types:
 *   registration_confirmed   — immediately after registration / paid
 *   event_schedule_changed   — when event_date, start_time, venue, or venue_address changes
 *   registration_cancelled   — when a registration is cancelled
 */
export type EventsEventType =
  | 'registration_confirmed'
  | 'event_reminder_24h'
  | 'event_reminder_1h'
  | 'event_schedule_changed'
  | 'registration_cancelled';

// ============================================================================
// Notification shape stored in the events notification table
// ============================================================================

export interface EventsNotification {
  /** UUID primary key */
  id: string;
  /** Maps to notifications.id via user_notifications join */
  notification_id: string;
  /** Recipient user (profile) id */
  user_id: string;
  /** Which trigger fired this notification */
  event_type: EventsEventType;
  /** events.id */
  event_id: string | null;
  /** events_registrations.id */
  registration_id: string | null;
  /** Short headline shown in bell icon */
  title: string;
  /** Body text shown in notification panel */
  body: string | null;
  /** In-app only for v1 */
  channels: string[];
  /** ISO timestamp when user dismissed / read */
  read_at: string | null;
  created_at: string;
}

// ============================================================================
// DTOs used by EventsNotificationService
// ============================================================================

export interface CreateEventsNotificationParams {
  user_ids: string[];
  event_type: EventsEventType;
  event_id?: string;
  registration_id?: string;
  title: string;
  body?: string;
}
