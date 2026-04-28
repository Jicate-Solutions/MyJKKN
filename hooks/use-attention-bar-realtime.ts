'use client';

/**
 * useAttentionBarRealtime — Supabase Realtime listener for Layer 0 urgent
 * notifications.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 0.
 *
 * What it does:
 *   1. Reads the current authenticated user's id from the supabase client.
 *   2. Opens a Realtime channel filtered to INSERT events on
 *      `user_notifications` for THIS user. (Filter applies server-side at
 *      the Supabase WAL → realtime layer; we get zero traffic for other
 *      users' inserts.)
 *   3. On every fire, calls `onUrgent()` and bumps `queueDepth`. The
 *      consumer (`<RealtimeListener/>`) uses the callback to invalidate
 *      the React Query cache so the resolver re-runs and Layer 0 is
 *      surfaced into the bar.
 *   4. Cleans up the channel on unmount or user change.
 *
 * Why filter on `user_notifications` and not `notifications`:
 *   - `notifications` carries the targeting JSONB (`{type:'user',user_id}`)
 *     which Realtime cannot filter by efficiently.
 *   - `user_notifications` is the per-user fanout row written by every
 *     emitter — already has `user_id` as a top-level FK.
 *   - The existing `useUnreadNotifications` hook uses the same pattern —
 *     consistency reduces cognitive load + reuses any debugging scaffolding.
 *
 * Why no payload filtering here:
 *   - Realtime gives us minimal payload (the inserted row of
 *     user_notifications, NOT the joined notifications row). To know if
 *     an insert is urgent + ack-required we'd need a second roundtrip.
 *   - Cheaper: just always bump queueDepth on insert and let the resolver
 *     do the filter. If the row is non-urgent, Layer 0 will return null
 *     and Layer 1/2 will fire — same outcome as before, no flicker.
 *   - The "+N" pip can over-count momentarily by 1; that's a reasonable
 *     cost for not adding 100ms+ to every fire.
 *
 * Latency budget (spec §3): 2 seconds end-to-end.
 *   ~500ms WAL → realtime fan-out
 *   ~50ms   onUrgent callback fires + invalidates cache
 *   ~100ms  resolver re-run (DB query in layer-0.ts)
 *   ~50ms   React re-render
 *   = ~700ms typical, well under 2s budget.
 *
 * Channel naming: `attention-bar-layer-0-${userId}` so we don't collide
 * with `unread-notifications-${userId}` in useUnreadNotifications. Both
 * channels can coexist on the same user without doubling traffic — Supabase
 * collapses identical filters at the broadcast layer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface UseAttentionBarRealtimeOptions {
  /**
   * Called whenever a new user_notifications row arrives for the current user.
   * The hook does NOT pre-filter for urgent — let the resolver do that.
   * (See header for rationale.)
   */
  onUrgent: () => void;
}

export interface UseAttentionBarRealtimeResult {
  /** True once the Realtime channel reaches SUBSCRIBED state. */
  isConnected: boolean;
  /**
   * Number of fire events seen since mount. The bar uses this to render the
   * "+N" pip when more than one urgent is active. Auto-decrements when the
   * consumer calls `acknowledgeOne()` (e.g. after the user taps the CTA).
   */
  queueDepth: number;
  /** Decrement queueDepth by 1 (clamped to 0). Called after acknowledgment. */
  acknowledgeOne: () => void;
  /** Reset queueDepth to 0. Called when the bar empties for any reason. */
  resetQueue: () => void;
}

export function useAttentionBarRealtime(
  options: UseAttentionBarRealtimeOptions,
): UseAttentionBarRealtimeResult {
  const { onUrgent } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [queueDepth, setQueueDepth] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  // Stash the latest onUrgent callback in a ref so the effect doesn't
  // re-subscribe whenever the consumer changes the closure. Channels
  // are expensive (one WebSocket frame per (re)subscribe) — re-attach
  // only on userId change.
  const onUrgentRef = useRef(onUrgent);
  useEffect(() => {
    onUrgentRef.current = onUrgent;
  }, [onUrgent]);

  // Resolve the current user id from the supabase client. We don't pull
  // it from a context here so the hook stays decoupled from the auth
  // provider — works in any tree that has a Supabase session cookie.
  useEffect(() => {
    const supabase = createClientSupabaseClient();
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Open the Realtime channel once we know who the user is. Tear down
  // and re-subscribe if userId ever changes (login → logout → login).
  useEffect(() => {
    if (!userId) return;

    const supabase = createClientSupabaseClient();
    let channel: RealtimeChannel | null = null;

    channel = supabase
      .channel(`attention-bar-layer-0-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Bump queue + tell the consumer to re-resolve. The resolver does
          // the urgent/ack filter; non-urgent inserts produce no visible
          // change in the bar (Layer 1/2 already covers that pathname).
          setQueueDepth((d) => d + 1);
          try {
            onUrgentRef.current();
          } catch (err) {
            // Don't let a broken callback kill the channel.
            console.warn('[attention-bar/realtime] onUrgent threw:', err);
          }
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
      setIsConnected(false);
    };
  }, [userId]);

  const acknowledgeOne = useCallback(() => {
    setQueueDepth((d) => Math.max(0, d - 1));
  }, []);

  const resetQueue = useCallback(() => {
    setQueueDepth(0);
  }, []);

  return { isConnected, queueDepth, acknowledgeOne, resetQueue };
}
