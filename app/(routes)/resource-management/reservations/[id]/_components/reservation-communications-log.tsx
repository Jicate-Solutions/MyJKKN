'use client';
// app/(routes)/resource-management/reservations/[id]/_components/reservation-communications-log.tsx
//
// The audit trail for "Message Booker" / "Message Selected" — every ad-hoc
// message sent about this booking, so the booker actually sees what was
// communicated (not just a bell notification that scrolls away) and staff can
// see what has already been said before sending another one.
//
// Same visibility as ReservationComments (RLS: fn_can_read_reservation_comments)
// — booker, approval-chain member, or institution-scoped admin staff — so this
// card self-gates via an empty result rather than a separate access check.

import { format } from 'date-fns';
import { MessagesSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReservationCommunications } from '@/hooks/resource-management/use-reservation-communications';

export function ReservationCommunicationsLog({
  reservationId
}: {
  reservationId: string;
}) {
  const { data: messages, isLoading } = useReservationCommunications(reservationId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className='pb-3'>
          <Skeleton className='h-5 w-40' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-16 w-full' />
        </CardContent>
      </Card>
    );
  }

  if (!messages || messages.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <MessagesSquare className='h-4 w-4' />
          Messages Sent
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {messages.map((m) => (
          <div key={m.id} className='rounded-md border p-3 text-sm'>
            <div className='mb-1 flex items-center justify-between gap-2'>
              <span className='font-medium'>{m.sender?.full_name || 'Staff'}</span>
              <span className='text-xs text-muted-foreground'>
                {format(new Date(m.created_at), 'PPp')}
              </span>
            </div>
            {m.subject && (
              <p className='mb-1 font-medium text-foreground'>{m.subject}</p>
            )}
            <p className='whitespace-pre-wrap text-muted-foreground'>{m.message}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
