'use client';
// app/(routes)/resource-management/reservations/_components/message-users-dialog.tsx
//
// Compose an ad-hoc in-app message to the booker(s) of one or more tagged
// reservations. Shared by the Approvals queue (bulk-select) and the
// reservation detail page (single "Message User" action) — both just hand it
// a list of Reservation rows.

import { useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useSendReservationMessage } from '@/hooks/resource-management/use-reservation-communications';
import type { Reservation } from '@/types/reservation';

const MIN_MESSAGE_LENGTH = 3;

interface MessageUsersDialogProps {
  reservations: Reservation[];
  open: boolean;
  onClose: () => void;
}

export function MessageUsersDialog({
  reservations,
  open,
  onClose
}: MessageUsersDialogProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const sendMessage = useSendReservationMessage();

  // One tag per booked user, not per reservation — several selected bookings
  // from the same person collapse into a single chip.
  const taggedUsers = useMemo(() => {
    const byUser = new Map<string, { name: string; email?: string }>();
    for (const r of reservations) {
      if (!byUser.has(r.user_id)) {
        byUser.set(r.user_id, {
          name: r.user?.full_name || 'Unknown user',
          email: r.user?.email
        });
      }
    }
    return Array.from(byUser.values());
  }, [reservations]);

  const handleClose = () => {
    setSubject('');
    setMessage('');
    onClose();
  };

  const handleSend = async () => {
    await sendMessage.mutateAsync({
      reservationIds: reservations.map((r) => r.id),
      subject: subject.trim() || undefined,
      message: message.trim()
    });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message {taggedUsers.length > 1 ? 'Users' : 'User'}</DialogTitle>
          <DialogDescription>
            Sends an in-app notification to everyone tagged below, and logs the
            message on each reservation.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label>Tagged {taggedUsers.length > 1 ? `(${taggedUsers.length})` : ''}</Label>
            <div className='flex flex-wrap gap-2'>
              {taggedUsers.map((u) => (
                <Badge key={u.email ?? u.name} variant='secondary'>
                  {u.name}
                </Badge>
              ))}
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='message-subject'>Subject (optional)</Label>
            <Input
              id='message-subject'
              placeholder='e.g. Venue change for your booking'
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='message-body'>Message *</Label>
            <Textarea
              id='message-body'
              placeholder='What do they need to know?'
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className='min-h-[120px]'
              maxLength={4000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={handleClose} disabled={sendMessage.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              message.trim().length < MIN_MESSAGE_LENGTH ||
              taggedUsers.length === 0 ||
              sendMessage.isPending
            }
          >
            {sendMessage.isPending ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Sending...
              </>
            ) : (
              <>
                <Send className='mr-2 h-4 w-4' />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
