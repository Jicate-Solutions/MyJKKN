// hooks/events/use-event-winners.ts
// Winner / runner-up / third place for a CULTURAL event (BUG-006273) — the
// counterpart of useRecordPlacings for tournaments. Reads and writes go through
// /api/events/winners?eventId=; the database decides who may write.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

/**
 * The only statuses a registration may have while it holds a place. Anything
 * else (cancelled, disqualified, no_show, waitlisted, ...) loses the place and
 * is not offered as a winner. KEEP IN STEP with c_active in
 * fn_events_registrations_final_rank_guard
 * (supabase/migrations/20271010090000_cultural_event_winners.sql).
 */
export const WINNER_ACTIVE_STATUSES: readonly string[] = ['registered', 'confirmed', 'checked_in', 'pending'];

export interface WinnerRegistration {
  id: string;
  form_id: string | null;
  participant_name: string;
  institution_name: string | null;
  department: string | null;
  status: string;
  final_rank: number | null;
}

export interface EventWinnersPayload {
  canManage: boolean;
  forms: { id: string; name: string }[];
  /** Managers: every registration. Everyone else: only the placed ones. */
  registrations: WinnerRegistration[];
}

export type WinnerChange = {
  registrationId: string;
  final_rank: number | null;
  /** The place the row held when the dialog loaded; the save is refused (409) if it has changed. */
  expectedRank?: number | null;
};

/** Shown when a save timed out on our side: the database may still have committed it. */
export const SAVE_TIMEOUT_MESSAGE =
  'The save is taking longer than expected and may already have gone through. Reloading the winners — check them before trying again.';

export const eventWinnersKey = (eventId: string) => ['event-winners', eventId] as const;

/** A request never hangs the screen: 15 s timeout, plus React Query's cancel signal when given. */
function requestSignal(signal?: AbortSignal): AbortSignal | undefined {
  const timeout =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(15000)
      : undefined;
  if (signal && timeout && typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any([signal, timeout]) as AbortSignal;
  }
  return timeout ?? signal;
}

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Something went wrong. Please try again.');
  return body;
}

export function useEventWinners(eventId: string, enabled = true) {
  return useQuery({
    queryKey: eventWinnersKey(eventId),
    queryFn: async ({ signal }): Promise<EventWinnersPayload> =>
      readJson(
        await fetch(`/api/events/winners?eventId=${encodeURIComponent(eventId)}`, { cache: 'no-store', signal: requestSignal(signal) }),
      ),
    enabled: !!eventId && enabled,
  });
}

/** Saves the whole set in one request; the database applies it in one transaction. */
export function useRecordEventWinners(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: WinnerChange[]) => {
      let res: Response;
      try {
        res = await fetch(`/api/events/winners?eventId=${encodeURIComponent(eventId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes }),
          signal: requestSignal(),
        });
      } catch (e) {
        // Our 15 s timeout stops waiting, not the database: the save may have
        // committed. Say so (onSettled reloads the winners) rather than show a
        // plain failure that invites a retry (#4311 r7).
        if ((e as { name?: string })?.name === 'TimeoutError') throw new Error(SAVE_TIMEOUT_MESSAGE);
        throw e;
      }
      return readJson(res);
    },
    onSuccess: () => {
      toast.success('Winners saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save winners'),
    onSettled: () => qc.invalidateQueries({ queryKey: eventWinnersKey(eventId) }),
  });
}
