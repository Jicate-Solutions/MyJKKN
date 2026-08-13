'use client';

// ============================================================================
// ROOM BUYOUT — confirming a charge that cannot be undone
// ============================================================================
// Created 2026-08-13.
//
// She is about to be billed for beds nobody is sleeping in, and the room will
// be locked so nobody can be placed in it for the rest of the year. Both of
// those are irreversible from her side, so the dialog says exactly that in
// plain words before the button is live.
//
// The amount is NOT computed here and NOT trusted from here. It comes from
// fn_room_buyout_quote, and the commit path re-derives it server-side and
// refuses if occupancy moved — so a tab left open overnight produces a polite
// "please ask again", never a wrong bill.
// ============================================================================

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Users } from 'lucide-react';
import { formatInr } from '@/hooks/campus-living/use-sole-occupancy-cost';
import type { RoomBuyoutQuote } from '@/types/campus-living/room-buyout';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: RoomBuyoutQuote;
  roomNumber: string | null | undefined;
  onConfirm: () => void;
  confirming: boolean;
}

export function RoomBuyoutDialog({
  open,
  onOpenChange,
  quote,
  roomNumber,
  onConfirm,
  confirming,
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const emptyBeds = quote.empty_beds;
  const roomLabel = roomNumber ? `Room ${roomNumber}` : 'your room';

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setAcknowledged(false);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Take {roomLabel} — {formatInr(quote.amount_per_resident)}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                You would pay for the {emptyBeds} empty{' '}
                {emptyBeds === 1 ? 'bed' : 'beds'} in {roomLabel} for the rest of the
                year. Your own bed is already covered by your hostel fee — this is
                only the beds nobody is using.
              </p>

              <div className="rounded-md border bg-muted/40 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">Your bed, already billed</span>
                  <span className="font-medium tabular-nums">
                    {formatInr(quote.per_bed_annual_rate)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">
                    {emptyBeds} empty {emptyBeds === 1 ? 'bed' : 'beds'} — new charge
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatInr(quote.amount_per_resident)}
                  </span>
                </div>
              </div>

              <p className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {roomLabel} will be held for you. Nobody else can be placed in it,
                  and you cannot undo this yourself — only the hostel office can
                  release it, and releasing it does not cancel the charge.
                </span>
              </p>

              {quote.consent_required ? (
                <p className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    You share this room, so nothing happens until every roommate
                    agrees. Each of them pays{' '}
                    {formatInr(quote.amount_per_resident)} too. If any of them
                    declines, nobody is billed.
                  </span>
                </p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-start gap-2">
          <Checkbox
            id="buyoutAck"
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor="buyoutAck" className="text-sm font-normal leading-snug">
            I understand I will be charged {formatInr(quote.amount_per_resident)} for the
            empty {emptyBeds === 1 ? 'bed' : 'beds'}, and that I cannot undo this.
          </Label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!acknowledged || confirming}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {confirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Working…
              </>
            ) : quote.consent_required ? (
              'Ask my roommates'
            ) : (
              'Take the room'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
