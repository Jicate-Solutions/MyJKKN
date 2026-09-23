'use client';

/**
 * DrainHealthBanner
 * Admin-only banner on /ai-query saying which computer is answering questions.
 *
 * Pilot decision #5: when the answering service is down, regular users get an
 * inline "temporarily offline" note on their question (handled in the API
 * route), and administrators additionally get this persistent banner so they
 * know to restart the drain.
 *
 * Two answerers (Director ruling 2026-09-23): the Windows chat drain, and a
 * standby on the Director's Mac (live, stamps its heartbeat every 60 s) that
 * answers when Windows is down.
 *
 * Driven by fn_ai_chat_drain_health (super-admin only; RAISEs otherwise —
 * so we ONLY call it when isSuperAdmin). `serving` says who is answering —
 * a heartbeat under 3 min old OR a question picked up in the last 10 min
 * (a heartbeat alone is not trusted; see migration 20270306090000):
 *   'windows'     → render nothing (normal)
 *   'mac_standby' → AMBER: Windows is down, the Mac backup is answering
 *   'none'        → RED: both answering computers are down. This is an early
 *                   warning: the super-admin page (chat-answerer-health.ts)
 *                   waits for 15 min of silence AND a question waiting
 *                   > 10 min, so red can show before anyone is paged.
 *   'unknown'     → render nothing (INERT — neither heartbeat ever stamped,
 *                   so there is no false alarm before the first heartbeat)
 * Before migration 20270306090000 is applied the RPC has no `serving`; the
 * old fields are mapped so the banner behaves exactly as it did then.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { AlertTriangle } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export type AnswererServing = 'windows' | 'mac_standby' | 'none' | 'unknown';

export interface DrainHealth {
  /** Windows chat drain: true fresh, false stale, null never stamped. */
  online: boolean | null;
  last_seen: string | null;
  /** Mac backup: true fresh, false stale, null never stamped. */
  standby_online?: boolean | null;
  standby_last_seen?: string | null;
  /** Last question picked up by the Windows side / by the Mac backup. */
  last_claim?: string | null;
  standby_last_claim?: string | null;
  serving?: AnswererServing;
}

export type BannerState =
  | { kind: 'hidden' }
  | { kind: 'standby'; windowsLastSeen: string | null }
  | { kind: 'down'; windowsLastSeen: string | null; standbyLastSeen: string | null };

/** Pure: what the banner should show for a health reading. */
export function resolveBannerState(health: DrainHealth | null): BannerState {
  if (!health) return { kind: 'hidden' };

  // Pre-migration payload (no `serving`): the old single-computer meaning.
  const serving: AnswererServing =
    health.serving ??
    (health.online === true ? 'windows' : health.online === false ? 'none' : 'unknown');

  switch (serving) {
    case 'mac_standby':
      return { kind: 'standby', windowsLastSeen: health.last_seen };
    case 'none':
      return {
        kind: 'down',
        windowsLastSeen: health.last_seen,
        standbyLastSeen: health.standby_last_seen ?? null,
      };
    default:
      return { kind: 'hidden' };
  }
}

function checkedIn(who: string, iso: string | null): string {
  return iso
    ? `${who} last checked in at ${new Date(iso).toLocaleString()}`
    : `${who} has never checked in`;
}

const POLL_INTERVAL_MS = 60_000;

export function DrainHealthBanner() {
  const { isSuperAdmin } = usePermissions([]);
  const [health, setHealth] = useState<DrainHealth | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const supabase = createClientSupabaseClient();
      // fn not yet in generated types (ships with the pilot-polish migration).
      const { data, error } = await (supabase as any).rpc('fn_ai_chat_drain_health');
      if (error || !data) return; // stay silent on any error (never a false banner)
      setHealth(data as DrainHealth);
    } catch {
      // silent — the banner never manufactures an offline state from an error
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSuperAdmin, poll]);

  if (!isSuperAdmin) return null;
  const state = resolveBannerState(health);
  if (state.kind === 'hidden') return null;

  if (state.kind === 'standby') {
    return (
      <div
        role="status"
        className="flex items-start gap-2 px-3 sm:px-4 py-2 bg-amber-50 border-b border-amber-300 text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-400"
      >
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm">
          <span className="font-semibold">The Windows answering computer is down. The Mac backup is answering.</span>{' '}
          {checkedIn('Windows', state.windowsLastSeen)}. Questions are still being answered;
          restart the chat drain on the Windows computer to switch back.
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-2 px-3 sm:px-4 py-2 bg-destructive/10 border-b border-destructive/30 text-destructive"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div className="text-xs sm:text-sm">
        <span className="font-semibold">Both answering computers are down. The assistant can’t answer right now.</span>{' '}
        {checkedIn('Windows', state.windowsLastSeen)}; {checkedIn('the Mac backup', state.standbyLastSeen)}.{' '}
        Users are being asked to try again later. Restart the chat drain on the Windows computer, or check that the Mac backup is running.
      </div>
    </div>
  );
}

export default DrainHealthBanner;
