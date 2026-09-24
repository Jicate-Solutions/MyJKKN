// hooks/resource-management/use-reservation-communications.ts
//
// React Query hooks for the reservation detail page's "Messages sent" log,
// and the mutation that sends one. Sending posts to
// POST /api/resource-management/reservations/communicate rather than writing
// through the browser client — the notification fan-out needs the
// service-role client (see the route's header comment).

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ReservationCommunicationService } from '@/lib/services/resource-management/reservation-communication-service';
import type { ReservationCommunication } from '@/types/reservation';

const KEYS = {
  all: ['reservation-communications'] as const,
  list: (id: string) => [...KEYS.all, 'list', id] as const,
};

export function useReservationCommunications(reservationId: string, enabled = true) {
  return useQuery<ReservationCommunication[]>({
    queryKey: KEYS.list(reservationId),
    queryFn: () => ReservationCommunicationService.list(reservationId),
    enabled: !!reservationId && enabled,
  });
}

interface SendReservationMessageInput {
  reservationIds: string[];
  subject?: string;
  message: string;
}

interface SendReservationMessageResult {
  ok: boolean;
  sent: number;
  notified: number;
  skipped: number;
  notFound: string[];
}

async function sendReservationMessage(
  input: SendReservationMessageInput,
): Promise<SendReservationMessageResult> {
  const res = await fetch('/api/resource-management/reservations/communicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || 'Failed to send the message');
  }
  return json as SendReservationMessageResult;
}

export function useSendReservationMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendReservationMessage,
    onSuccess: (result, { reservationIds }) => {
      for (const id of reservationIds) {
        qc.invalidateQueries({ queryKey: KEYS.list(id) });
      }
      toast.success(
        result.notified === 1
          ? 'Message sent'
          : `Message sent to ${result.notified} users`,
      );
    },
    onError: (e: Error) => toast.error(e.message || 'The message could not be sent'),
  });
}
