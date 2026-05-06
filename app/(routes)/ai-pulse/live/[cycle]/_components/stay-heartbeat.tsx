'use client';

/**
 * AI Pulse — Stay-Until-End Heartbeat
 *
 * Fires `recordHeartbeat(cycleId)` on a fixed interval while the page is
 * mounted AND the document is visible. Stops on unmount + on visibility
 * change to hidden (to avoid burning quota when the learner backgrounded
 * the tab — that learner has effectively left).
 *
 * Design notes:
 *   - Component is invisible (returns null). It's purely an effect hook
 *     wrapper, but kept as a component so the parent shell can mount/unmount
 *     it cleanly (e.g. only after Join, only while session is live).
 *   - The "final ping" the spec calls for is implicit — when the cycle
 *     ends_at falls behind now(), the latest heartbeat IS the stay-until
 *     timestamp, and the 4-AND gate compares stayed_until ≥ ends_at HH:MM.
 *   - We don't beacon on unmount: that would race the unload and the
 *     service-role write needs the auth cookie which beacon can't carry
 *     reliably across browsers.
 *
 * Frequency: 60s default. Tunable via prop for testing.
 */

import { useEffect, useRef } from 'react';
import { useRecordHeartbeat } from '@/lib/services/ai-pulse/live-session-service';

interface StayHeartbeatProps {
  cycleId: string;
  enabled: boolean; // false = don't ping (e.g. before Join, after end)
  intervalMs?: number;
}

export function StayHeartbeat({
  cycleId,
  enabled,
  intervalMs = 60_000,
}: StayHeartbeatProps) {
  const heartbeat = useRecordHeartbeat(cycleId);
  const heartbeatRef = useRef(heartbeat);
  // Always read the latest mutation function — react-query mutation objects
  // are stable, but defending against dev-mode StrictMode double-mounts
  heartbeatRef.current = heartbeat;

  useEffect(() => {
    if (!enabled || !cycleId) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const ping = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      heartbeatRef.current.mutate();
    };

    // Fire immediately so we capture an early "started ticking" timestamp,
    // then on the interval.
    ping();
    timer = setInterval(ping, intervalMs);

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (!document.hidden) ping();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [enabled, cycleId, intervalMs]);

  return null;
}
