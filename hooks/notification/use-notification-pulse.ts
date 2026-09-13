'use client';

import { useEffect } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { PendingAction, UnacknowledgedNotification } from '@/types/notifications';

/**
 * useNotificationPulse — the one notification poll shared by AcknowledgmentGate
 * and ActionItemsWidget. Both read the same query, so a page that mounts both
 * makes one request per cycle instead of two.
 *
 * Cadence: 60 s while the person is using the tab, 5 min once the tab has been
 * idle for two minutes. A hidden tab does not poll at all
 * (refetchIntervalInBackground: false) and refreshes the moment it is focused
 * again (refetchOnWindowFocus: true).
 *
 * No cache-buster on the URL: the route answers 304 with an ETag, and fetch()
 * turns that into a 200 with the browser's cached body, so callers never see
 * the difference.
 */

export const NOTIFICATION_PULSE_KEY = ['notification-pulse'] as const;
export const PULSE_ACTIVE_INTERVAL_MS = 60_000;
export const PULSE_IDLE_INTERVAL_MS = 300_000;
export const PULSE_INTERACTION_WINDOW_MS = 120_000;

export interface NotificationPulse {
  unacknowledged: UnacknowledgedNotification[];
  pending: {
    actions: PendingAction[];
    urgent_count: number;
    tracked_count: number;
  };
  generated_at: string;
}

const EMPTY_PULSE: NotificationPulse = {
  unacknowledged: [],
  pending: { actions: [], urgent_count: 0, tracked_count: 0 },
  generated_at: ''
};

/** 60 s if the person interacted within the last 120 s, else 5 min. */
export function pulseIntervalFor(lastInteractionAt: number, now: number = Date.now()): number {
  return now - lastInteractionAt <= PULSE_INTERACTION_WINDOW_MS
    ? PULSE_ACTIVE_INTERVAL_MS
    : PULSE_IDLE_INTERVAL_MS;
}

// Module-level so every observer of the query shares one reading and the
// listeners are installed once per page, not once per component.
let lastInteractionAt = Date.now();
let listenersInstalled = false;

function markInteraction() {
  lastInteractionAt = Date.now();
}

function installInteractionListeners() {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  const passive = { passive: true } as const;
  window.addEventListener('pointerdown', markInteraction, passive);
  window.addEventListener('keydown', markInteraction, passive);
  window.addEventListener('touchstart', markInteraction, passive);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markInteraction();
  });
}

async function fetchNotificationPulse(): Promise<NotificationPulse> {
  const res = await fetch('/api/notifications/pulse');
  if (!res.ok) return EMPTY_PULSE;
  return res.json();
}

/** Exported so the cadence flags can be asserted without rendering. */
export const notificationPulseQueryOptions = {
  queryKey: NOTIFICATION_PULSE_KEY,
  queryFn: fetchNotificationPulse,
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  refetchInterval: () => pulseIntervalFor(lastInteractionAt)
} as const;

export function useNotificationPulse(options?: { enabled?: boolean }) {
  useEffect(() => {
    installInteractionListeners();
  }, []);

  return useQuery({
    ...notificationPulseQueryOptions,
    enabled: options?.enabled ?? true
  });
}

export function invalidateNotificationPulse(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: NOTIFICATION_PULSE_KEY });
}
