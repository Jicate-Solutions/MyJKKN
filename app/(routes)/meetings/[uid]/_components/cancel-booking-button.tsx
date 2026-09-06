'use client';

// app/(routes)/meetings/[uid]/_components/cancel-booking-button.tsx
//
// Host cancel control for the native booking detail page (Phase N2).
// Confirmation is inline (two-step button) — no Radix dialog needed.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cancelMyBooking } from '../actions';

export function CancelBookingButton({ uid }: { uid: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const result = await cancelMyBooking(uid);
      if (result.success) {
        toast.success('Booking cancelled.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Could not cancel the booking.');
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={confirming ? 'destructive' : 'outline'}
        size="sm"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        )}
        {confirming ? 'Click again to confirm cancel' : 'Cancel booking'}
      </Button>
      {confirming && !pending ? (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Keep booking
        </Button>
      ) : null}
    </div>
  );
}
