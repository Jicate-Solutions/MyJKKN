'use client';

/**
 * DrainHealthBanner
 * Admin-only red banner shown when the Max-lane chat drain is OFFLINE.
 *
 * Pilot decision #5: when the answering service is down, regular users get an
 * inline "temporarily offline" note on their question (handled in the API
 * route), and administrators additionally get this persistent red banner so
 * they know to restart the drain.
 *
 * Driven by fn_ai_chat_drain_health (super-admin only; RAISEs otherwise —
 * so we ONLY call it when isSuperAdmin). It reads the heartbeat the Windows
 * chat drain stamps each cycle:
 *   online === true   → fresh (<3 min)          → render nothing
 *   online === false  → stale (drain down)      → render the red banner
 *   online === null   → never stamped yet       → render nothing (INERT, so
 *                                                 there is no false alarm
 *                                                 before the first heartbeat)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { AlertTriangle } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface DrainHealth {
  online: boolean | null;
  last_seen: string | null;
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

  // Inert unless we have a definitive "offline" (a stamped-but-stale heartbeat).
  if (!isSuperAdmin || !health || health.online !== false) return null;

  const lastSeen = health.last_seen
    ? new Date(health.last_seen).toLocaleString()
    : 'an unknown time';

  return (
    <div className="flex items-start gap-2 px-3 sm:px-4 py-2 bg-destructive/10 border-b border-destructive/30 text-destructive">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div className="text-xs sm:text-sm">
        <span className="font-semibold">AI Assistant chat is offline.</span>{' '}
        The Max answering service hasn’t responded since {lastSeen}. Users are being
        asked to try again later — restart the chat drain to bring it back.
      </div>
    </div>
  );
}

export default DrainHealthBanner;
