'use client';

import { useEffect } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryFunctionContext
} from '@tanstack/react-query';
import type { PendingAction, UnacknowledgedNotification } from '@/types/notifications';

/**
 * useNotificationPulse — the one notification poll shared by AcknowledgmentGate
 * and ActionItemsWidget. Both read the same query, so a page that mounts both
 * makes one request per cycle instead of two.
 *
 * Cadence: 60 s while the person is using the tab, 5 min once the tab has been
 * idle for two minutes. A hidden tab does not poll at all
 * (refetchIntervalInBackground: false) and refreshes the moment it is focused
 * again (refetchOnWindowFocus: true). The first interaction after an idle
 * stretch triggers one immediate refetch, which also re-arms the 60 s timer
 * (React Query re-reads the interval function on every query update).
 *
 * Pending actions are opt-in per tab: the route only runs get_pending_actions
 * when `?pending=1` is present, and the hook only appends it while at least
 * one usePendingActionsConsumer() is mounted (the dashboard widget). Every
 * other page polls the acknowledgment list alone, as it did before.
 *
 * No cache-buster on the URL: the route answers 304 with an ETag and fetch()
 * turns that into a 200 with the browser's cached body. A bare 304 (no cached
 * body) and any other non-OK status keep the previous data rather than
 * replacing it with an empty pulse.
 */

export const NOTIFICATION_PULSE_KEY = ['notification-pulse'] as const;
export const NOTIFICATION_PULSE_URL = '/api/notifications/pulse';
export const PULSE_ACTIVE_INTERVAL_MS = 60_000;
export const PULSE_IDLE_INTERVAL_MS = 300_000;
export const PULSE_INTERACTION_WINDOW_MS = 120_000;

export interface PendingPulse {
  actions: PendingAction[];
  urgent_count: number;
  tracked_count: number;
}

export interface NotificationPulse {
  unacknowledged: UnacknowledgedNotification[];
  /** null when this tab did not ask for pending actions. */
  pending: PendingPulse | null;
  generated_at: string;
}

export const EMPTY_PENDING: PendingPulse = { actions: [], urgent_count: 0, tracked_count: 0 };
const EMPTY_PULSE: NotificationPulse = { unacknowledged: [], pending: null, generated_at: '' };

/** 60 s if the person interacted within the last 120 s, else 5 min. */
export function pulseIntervalFor(lastInteractionAt: number, now: number = Date.now()): number {
  return now - lastInteractionAt <= PULSE_INTERACTION_WINDOW_MS
    ? PULSE_ACTIVE_INTERVAL_MS
    : PULSE_IDLE_INTERVAL_MS;
}

// ---- module state: one reading per page, shared by every observer ----------
let lastInteractionAt = Date.now();
let listenersInstalled = false;
let pendingConsumers = 0;
let activeQueryClient: QueryClient | null = null;

/** The URL the next poll will hit: `?pending=1` only while a consumer is mounted. */
export function pulseUrlFor(consumers: number = pendingConsumers): string {
  return consumers > 0 ? `${NOTIFICATION_PULSE_URL}?pending=1` : NOTIFICATION_PULSE_URL;
}

function markInteraction() {
  const now = Date.now();
  const wasIdle = now - lastInteractionAt > PULSE_INTERACTION_WINDOW_MS;
  lastInteractionAt = now;
  // idle → active: refresh now and let the query update re-arm the 60 s timer.
  // Interactions while already active do nothing (the timer is running).
  if (wasIdle && activeQueryClient) {
    void activeQueryClient.refetchQueries({ queryKey: NOTIFICATION_PULSE_KEY });
  }
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

async function fetchNotificationPulse({ client }: QueryFunctionContext): Promise<NotificationPulse> {
  const res = await fetch(pulseUrlFor());
  if (res.status === 304) {
    // Bare 304 (fetch() normally hides these behind the cached 200): nothing changed.
    return client.getQueryData<NotificationPulse>(NOTIFICATION_PULSE_KEY) ?? EMPTY_PULSE;
  }
  // Any other failure keeps the last good data and marks the query errored —
  // never swap an open gate or a populated widget for an empty pulse.
  if (!res.ok) throw new Error(`pulse ${res.status}`);
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
  const queryClient = useQueryClient();

  useEffect(() => {
    activeQueryClient = queryClient;
    installInteractionListeners();
  }, [queryClient]);

  return useQuery({
    ...notificationPulseQueryOptions,
    enabled: options?.enabled ?? true
  });
}

/**
 * Mount this (before useNotificationPulse) in any component that reads
 * data.pending. While at least one is mounted the poll asks the route for
 * pending actions too; the 0→1 transition refetches so the very next pulse
 * carries them.
 */
export function usePendingActionsConsumer() {
  const queryClient = useQueryClient();
  useEffect(() => {
    pendingConsumers += 1;
    if (pendingConsumers === 1) void invalidateNotificationPulse(queryClient);
    return () => {
      pendingConsumers -= 1;
    };
  }, [queryClient]);
}

export function invalidateNotificationPulse(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: NOTIFICATION_PULSE_KEY });
}
