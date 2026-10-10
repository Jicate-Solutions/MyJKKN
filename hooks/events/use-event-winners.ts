// hooks/events/use-event-winners.ts
// Winner / runner-up / third place for a CULTURAL event (BUG-006273) — the
// counterpart of useRecordPlacings for tournaments. Reads and writes go through
// /api/events/winners?eventId=; the database decides who may write.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

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

export type WinnerChange = { registrationId: string; final_rank: number | null };

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
    mutationFn: async (changes: WinnerChange[]) =>
      readJson(
        await fetch(`/api/events/winners?eventId=${encodeURIComponent(eventId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes }),
          signal: requestSignal(),
        }),
      ),
    onSuccess: () => {
      toast.success('Winners saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save winners'),
    onSettled: () => qc.invalidateQueries({ queryKey: eventWinnersKey(eventId) }),
  });
}
