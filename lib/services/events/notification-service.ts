// lib/services/events/notification-service.ts
// Static-class wrapper for Events in-app notifications.
// Follows the same pattern as lib/services/faculty-innovation/notification-service.ts.
//
// v1: channels=['in_app'] only.
// Dispatches via the shared notifications + user_notifications tables.
// Server-side only — uses createServiceRoleClient.

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  EventsEventType,
  CreateEventsNotificationParams,
} from '@/types/events-notifications';

export class EventsNotificationService {
  // --------------------------------------------------------------------------
  // Core dispatcher — shared by all trigger handlers
  // --------------------------------------------------------------------------

  /**
   * Insert one notification row and link it to all specified user IDs.
   * Returns the number of users notified (0 if userIds is empty).
   *
   * Uses the same notifications + user_notifications pattern as work-pulse.
   */
  static async dispatch(params: CreateEventsNotificationParams): Promise<number> {
    const { user_ids, event_type, event_id, registration_id, title, body } = params;

    if (!user_ids || user_ids.length === 0) return 0;

    const supabase = createServiceRoleClient();

    try {
      // Insert one notification row
      const { data: notification, error: notifError } = await supabase
        .from('notifications')
        .insert({
          type: 'events',
          title,
          message: body ?? title,
          metadata: {
            source: 'events_notify',
            event_type,
            ...(event_id ? { event_id } : {}),
            ...(registration_id ? { registration_id } : {}),
          },
        })
        .select('id')
        .single();

      if (notifError || !notification) {
        logger.error('events/notifications', 'Failed to insert notification row', notifError);
        return 0;
      }

      // Link to all users
      const links = user_ids.map((uid) => ({
        notification_id: notification.id,
        user_id: uid,
      }));

      const { error: linkError } = await supabase
        .from('user_notifications')
        .insert(links);

      if (linkError) {
        logger.error('events/notifications', 'Failed to insert user_notification links', linkError);
        return 0;
      }

      logger.dev(
        'events/notifications',
        `Dispatched [${event_type}] to ${user_ids.length} user(s)`,
        { notificationId: notification.id }
      );

      return user_ids.length;
    } catch (err) {
      logger.error('events/notifications', 'Unexpected error in dispatch', err);
      return 0;
    }
  }

  // --------------------------------------------------------------------------
  // Convenience wrappers — one per EventsEventType
  // --------------------------------------------------------------------------

  /**
   * registration_confirmed
   * Call immediately after a registration row is created (or payment confirmed).
   */
  static async notifyRegistrationConfirmed(params: {
    user_ids: string[];
    event_name: string;
    event_id: string;
    registration_id: string;
    bib_number?: string | null;
    event_date?: string | null;
    venue?: string | null;
  }): Promise<number> {
    const bibPart = params.bib_number ? ` Your BIB: ${params.bib_number}.` : '';
    const datePart = params.event_date
      ? ` Event date: ${new Date(params.event_date).toLocaleDateString('en-IN', { dateStyle: 'long' })}.`
      : '';
    const venuePart = params.venue ? ` Venue: ${params.venue}.` : '';

    return this.dispatch({
      user_ids: params.user_ids,
      event_type: 'registration_confirmed',
      event_id: params.event_id,
      registration_id: params.registration_id,
      title: `Registration confirmed — ${params.event_name}`,
      body: `You are registered for ${params.event_name}.${bibPart}${datePart}${venuePart}`,
    });
  }

  /**
   * event_reminder_24h
   * Triggered by cron ~24 hours before event_date.
   */
  static async notifyReminder24h(params: {
    user_ids: string[];
    event_name: string;
    event_id: string;
    event_date: string;
    start_time?: string | null;
    venue?: string | null;
  }): Promise<number> {
    const timePart = params.start_time ? ` at ${params.start_time}` : '';
    const venuePart = params.venue ? ` at ${params.venue}` : '';

    return this.dispatch({
      user_ids: params.user_ids,
      event_type: 'event_reminder_24h',
      event_id: params.event_id,
      title: `Reminder: ${params.event_name} is tomorrow`,
      body: `${params.event_name} starts tomorrow${timePart}${venuePart}. Make sure you're prepared!`,
    });
  }

  /**
   * event_reminder_1h
   * Triggered by cron ~1 hour before event_date + start_time.
   */
  static async notifyReminder1h(params: {
    user_ids: string[];
    event_name: string;
    event_id: string;
    start_time?: string | null;
    venue?: string | null;
  }): Promise<number> {
    const timePart = params.start_time ? ` at ${params.start_time}` : '';
    const venuePart = params.venue ? ` at ${params.venue}` : '';

    return this.dispatch({
      user_ids: params.user_ids,
      event_type: 'event_reminder_1h',
      event_id: params.event_id,
      title: `${params.event_name} starts in 1 hour`,
      body: `${params.event_name} begins${timePart}${venuePart}. Head to the starting point now!`,
    });
  }

  /**
   * event_schedule_changed
   * Triggered when event_date, start_time, venue, or venue_address is updated.
   */
  static async notifyScheduleChanged(params: {
    user_ids: string[];
    event_name: string;
    event_id: string;
    new_date?: string | null;
    new_time?: string | null;
    new_venue?: string | null;
  }): Promise<number> {
    const changes: string[] = [];
    if (params.new_date)
      changes.push(
        `new date: ${new Date(params.new_date).toLocaleDateString('en-IN', { dateStyle: 'long' })}`
      );
    if (params.new_time) changes.push(`new time: ${params.new_time}`);
    if (params.new_venue) changes.push(`new venue: ${params.new_venue}`);

    const changeSummary =
      changes.length > 0 ? ` Updates — ${changes.join(', ')}.` : '';

    return this.dispatch({
      user_ids: params.user_ids,
      event_type: 'event_schedule_changed',
      event_id: params.event_id,
      title: `Schedule update — ${params.event_name}`,
      body: `The schedule for ${params.event_name} has changed.${changeSummary} Please check the event details.`,
    });
  }

  /**
   * registration_cancelled
   * Triggered when a registration is cancelled by admin or participant.
   */
  static async notifyRegistrationCancelled(params: {
    user_ids: string[];
    event_name: string;
    event_id: string;
    registration_id: string;
    reason?: string;
  }): Promise<number> {
    const reasonPart = params.reason ? ` Reason: ${params.reason}.` : '';

    return this.dispatch({
      user_ids: params.user_ids,
      event_type: 'registration_cancelled',
      event_id: params.event_id,
      registration_id: params.registration_id,
      title: `Registration cancelled — ${params.event_name}`,
      body: `Your registration for ${params.event_name} has been cancelled.${reasonPart} Contact the organiser for assistance.`,
    });
  }
}
