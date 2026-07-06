'use client';

/**
 * useInductionPollRealtime — anonymity-safe live refresh for an induction poll.
 *
 * Subscribes to the per-poll broadcast topic 'induction_poll:<pollId>' and calls
 * `onChange` whenever ANY vote lands (insert / change / delete). The broadcast is
 * fired by the DB trigger fn_induction_poll_vote_broadcast, whose payload carries
 * ONLY poll_id — never vote content or learner identity — so the ping simply tells
 * subscribers "something changed, refetch totals now". The channel is private:true;
 * the realtime.messages receive policy scopes each subscribe to the poll's enrolled
 * learners and the session host (knowing the topic UUID is not sufficient).
 *
 * Mirrors the removeChannel cleanup pattern of features/hr/payroll/use-payroll-period-realtime.ts.
 * Callers KEEP their existing setInterval polling as a resilience fallback in case
 * the realtime socket drops.
 */

import { useEffect, useMemo, useRef } from 'react';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Coalesce a burst of vote pings into at most ONE refetch per window. Every vote
// broadcasts to every subscriber, so an un-coalesced refetch-per-ping is an N²
// RPC storm during a live session (435 learners × 435 votes ≈ 190k refetches). A
// trailing window caps each subscriber to ≤1 refetch per COALESCE_MS regardless of
// how fast votes arrive, at the cost of ≤COALESCE_MS of extra latency (invisible on
// a projector / live banner).
const COALESCE_MS = 1200;

export function useInductionPollRealtime(pollId: string | undefined, onChange: () => void) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  // Keep the latest callback without re-subscribing on every render.
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!pollId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => { timer = null; cbRef.current(); };

    // private:true — the realtime.messages receive RLS policy authorizes this
    // subscribe against the poll's learners/host; the client's Supabase session
    // token is sent for that check. If it's denied, no pings arrive and the
    // caller's interval polling keeps the view fresh (safe degrade, never break).
    const channel = supabase
      .channel(`induction_poll:${pollId}`, { config: { private: true } })
      .on('broadcast', { event: 'vote' }, () => {
        // First ping in a quiet window schedules a single trailing refetch; any
        // further pings that arrive inside the window are absorbed into that fire.
        if (timer === null) timer = setTimeout(fire, COALESCE_MS);
      })
      .subscribe();

    return () => {
      if (timer !== null) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [pollId, supabase]);
}
