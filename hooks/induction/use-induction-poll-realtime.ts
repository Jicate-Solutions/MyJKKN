'use client';

/**
 * useInductionPollRealtime — anonymity-safe live refresh for an induction poll.
 *
 * Subscribes to the per-poll broadcast topic 'induction_poll:<pollId>' and calls
 * `onChange` whenever ANY vote lands (insert / change / delete). The broadcast is
 * fired by the DB trigger fn_induction_poll_vote_broadcast, whose payload carries
 * ONLY poll_id — never vote content or learner identity — so the ping simply tells
 * subscribers "something changed, refetch totals now". The topic is an unguessable
 * UUID, so private=false is safe.
 *
 * Mirrors the removeChannel cleanup pattern of features/hr/payroll/use-payroll-period-realtime.ts.
 * Callers KEEP their existing setInterval polling as a resilience fallback in case
 * the realtime socket drops.
 */

import { useEffect, useMemo, useRef } from 'react';

import { createClientSupabaseClient } from '@/lib/supabase/client';

export function useInductionPollRealtime(pollId: string | undefined, onChange: () => void) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  // Keep the latest callback without re-subscribing on every render.
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!pollId) return;

    const channel = supabase
      .channel(`induction_poll:${pollId}`)
      .on('broadcast', { event: 'vote' }, () => {
        cbRef.current();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pollId, supabase]);
}
