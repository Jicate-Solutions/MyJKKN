'use client';
// app/(routes)/resource-management/reservations/[id]/_components/reservation-message-action.tsx
//
// "Message User" — the single-reservation counterpart to the Approvals
// queue's "Message Selected" bulk action. Gated on the same permission,
// resources.reservations.communicate, so the button is absent for anyone who
// could not send the request through anyway.

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageUsersDialog } from '../../_components/message-users-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import type { Reservation } from '@/types/reservation';

export function ReservationMessageAction({
  reservation
}: {
  reservation: Reservation;
}) {
  const [open, setOpen] = useState(false);
  const { can, isLoading } = usePermissions();

  if (isLoading || !can('resources.reservations.communicate')) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Message Booker</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setOpen(true)} variant='outline' className='w-full'>
            <MessageSquare className='mr-2 h-4 w-4' />
            Message User
          </Button>
        </CardContent>
      </Card>

      <MessageUsersDialog
        reservations={open ? [reservation] : []}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
