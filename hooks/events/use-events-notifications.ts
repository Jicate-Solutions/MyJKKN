// hooks/events/use-events-notifications.ts
// React Query client hook for dispatching Events notifications via
// /api/events/notify?type=<EventsEventType>.
//
// Usage (event-driven triggers only — cron types are server-only):
//
//   const { notifyRegistrationConfirmed } = useEventsNotifications();
//   await notifyRegistrationConfirmed({ event_id, registration_id });
//
// The hook does NOT expose cron-pollable triggers (reminders) because those
// should only be called by Vercel Cron / server-side routes.

'use client';

import { useMutation } from '@tanstack/react-query';
import type { EventsEventType } from '@/types/events-notifications';

// ─── API helper ──────────────────────────────────────────────────────────────

async function callNotifyRoute(
  type: EventsEventType,
  body: Record<string, unknown>
): Promise<{ notified: number }> {
  const res = await fetch(`/api/events/notify?type=${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Notification dispatch failed (${res.status})`);
  }

  return res.json();
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useEventsNotifications
 *
 * Returns three fire-and-forget mutation functions for event-driven triggers.
 * Cron-type reminders (24h / 1h) are omitted — they live server-side only.
 *
 * NOTE: The /api/events/notify route uses x-api-key auth for the cron path.
 * These client mutations call the same route but rely on the server to look up
 * the API key from env — the key is NOT exposed to the browser. The route
 * accepts requests without an API key when called from a session context
 * if EVENTS_NOTIFY_API_KEY is absent (dev mode). In production the API key
 * should only be used by cron; event-driven calls should be made server-side
 * from the relevant API route handlers.
 *
 * Preferred usage: call EventsNotificationService.dispatch() directly from
 * your server-side API route rather than this hook. Use this hook only when
 * you need a client-side "fire after mutation" pattern (e.g. optimistic UI).
 */
export function useEventsNotifications() {
  // ── registration_confirmed ────────────────────────────────────────────────

  const registrationConfirmedMutation = useMutation({
    mutationFn: (params: { event_id: string; registration_id: string }) =>
      callNotifyRoute('registration_confirmed', params),
    onError: (error: Error) => {
      // Silent — notifications are non-critical
      console.warn('[events/notify] registration_confirmed failed:', error.message);
    },
  });

  // ── event_schedule_changed ────────────────────────────────────────────────

  const scheduleChangedMutation = useMutation({
    mutationFn: (params: {
      event_id: string;
      changed_fields?: {
        event_date?: string;
        start_time?: string;
        venue?: string;
        venue_address?: string;
      };
    }) => callNotifyRoute('event_schedule_changed', params),
    onError: (error: Error) => {
      console.warn('[events/notify] event_schedule_changed failed:', error.message);
    },
  });

  // ── registration_cancelled ────────────────────────────────────────────────

  const registrationCancelledMutation = useMutation({
    mutationFn: (params: {
      event_id: string;
      registration_id: string;
      reason?: string;
    }) => callNotifyRoute('registration_cancelled', params),
    onError: (error: Error) => {
      console.warn('[events/notify] registration_cancelled failed:', error.message);
    },
  });

  return {
    /**
     * Notify a registrant their registration is confirmed.
     * Fire after any registration insert or payment success callback.
     */
    notifyRegistrationConfirmed: registrationConfirmedMutation.mutateAsync,

    /**
     * Notify all registrants that the event schedule has changed.
     * Pass changed_fields to include specifics in the notification body.
     */
    notifyScheduleChanged: scheduleChangedMutation.mutateAsync,

    /**
     * Notify a registrant their registration was cancelled.
     */
    notifyRegistrationCancelled: registrationCancelledMutation.mutateAsync,

    // Pending states (useful for disabling UI buttons)
    isNotifyingConfirmation: registrationConfirmedMutation.isPending,
    isNotifyingSchedule: scheduleChangedMutation.isPending,
    isNotifyingCancellation: registrationCancelledMutation.isPending,
  };
}
