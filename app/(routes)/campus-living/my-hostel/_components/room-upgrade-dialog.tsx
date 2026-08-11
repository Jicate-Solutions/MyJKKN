'use client';

import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, BedDouble, DoorOpen, Loader2 } from 'lucide-react';
import { useUpgradeRooms, useUpgradeRoom, useUpgradeCategoryOnly } from '@/hooks/campus-living/use-category-upgrade';
import type { UpgradeRoomOption } from '@/types/campus-living/category-upgrade';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  currentCategoryName: string | null;
  /** PAYABLE after any configured discount. */
  upgradeFee: number;
  /** Pre-discount list price — struck through when it exceeds upgradeFee. */
  upgradeFeeOriginal?: number;
  upgradeDiscount?: number;
  thresholdPct: number | null;
  paidPct: number | null;
  meetsThreshold: boolean;
  holdDays: number;
  /** 'book' = first allocation (no prior room): instant, no fee/threshold. */
  mode?: 'book' | 'upgrade';
  /** AUTO category (Classic/Deluxe): no manual room selection — show a fee-only
   *  confirm and auto-pick a room behind the scenes (the room is otherwise
   *  office-allocated). MANUAL categories (Premium) keep the room picker. */
  autoPick?: boolean;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const floorLabel = (floor: number) => (floor === 0 ? 'Ground floor' : `Floor ${floor}`);

export function RoomUpgradeDialog({
  open, onOpenChange, categoryId, categoryName, currentCategoryName, upgradeFee,
  upgradeFeeOriginal, upgradeDiscount,
  thresholdPct, paidPct, meetsThreshold, holdDays, mode = 'upgrade', autoPick = false,
}: Props) {
  const isBook = mode === 'book';
  const discountOff = upgradeDiscount ?? 0;
  const feeRow = (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground">Upgrade fee</span>
      <span className="flex items-baseline gap-2">
        {discountOff > 0 && (
          <span className="text-xs text-muted-foreground line-through">
            {inr(upgradeFeeOriginal ?? upgradeFee)}
          </span>
        )}
        <span className="font-semibold">{upgradeFee <= 0 ? 'Free' : inr(upgradeFee)}</span>
        {discountOff > 0 && (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {inr(discountOff)} off
          </span>
        )}
      </span>
    </div>
  );
  // Move-now: on confirm the learner is moved into the room immediately and the
  // upgrade fee (if any) is billed — no reserve-and-pay-to-confirm.
  const { data: rooms = [], isLoading } = useUpgradeRooms(open && !autoPick ? categoryId : null);
  const upgrade = useUpgradeRoom();
  const categoryOnly = useUpgradeCategoryOnly();
  const [roomId, setRoomId] = useState('');
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');

  const selected = rooms.find((r) => r.room_id === roomId) ?? null;

  const grouped = useMemo(
    () =>
      rooms.reduce<Record<string, UpgradeRoomOption[]>>((acc, r) => {
        const key = `${r.block_name} · ${floorLabel(r.floor)}`;
        (acc[key] ??= []).push(r);
        return acc;
      }, {}),
    [rooms]
  );

  const reset = () => { setRoomId(''); setStep('pick'); };

  const confirm = async () => {
    if (!selected || upgrade.isPending) return;
    await upgrade.mutateAsync({ categoryId, roomId: selected.room_id });
    onOpenChange(false);
    reset();
  };

  // AUTO category (Classic/Deluxe): no manual room selection. Show the fee, auto-pick a
  // room behind the scenes and generate the upgrade bill on confirm — the room moves once
  // the bill is paid; the office otherwise auto-allocates these categories.
  if (autoPick) {
    const submit = async () => {
      if (categoryOnly.isPending) return;
      await categoryOnly.mutateAsync(categoryId);
      onOpenChange(false);
      reset();
    };
    return (
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
        <DialogContent className="w-[95vw] max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Upgrade to {categoryName}</DialogTitle>
            <DialogDescription>
              On confirm, an upgrade bill is generated. Your category changes to {categoryName}
              once the bill is fully paid — no room is reserved now; your {categoryName} room is
              assigned afterwards by the hostel office.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border divide-y text-sm">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium text-right">
                {currentCategoryName ? `${currentCategoryName} → ` : ''}{categoryName}
              </span>
            </div>
            {!isBook && feeRow}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={categoryOnly.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={categoryOnly.isPending}>
              {categoryOnly.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {upgradeFee > 0 ? 'Upgrade & generate bill' : 'Confirm upgrade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto">
        {step === 'pick' ? (
          <>
            <DialogHeader>
              <DialogTitle>{isBook ? `Book a ${categoryName} room` : `Upgrade to ${categoryName}`}</DialogTitle>
              <DialogDescription>
                Only {categoryName} rooms with a free bed are shown. Pick a room to continue.
              </DialogDescription>
            </DialogHeader>

            {isLoading ? (
              <div className="flex items-center text-sm text-muted-foreground py-6">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading available rooms…
              </div>
            ) : rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">
                No available rooms right now{isBook ? '' : ' — close this and choose “Join waitlist” instead'}.
              </p>
            ) : (
              <div className="space-y-4 max-h-[360px] overflow-y-auto">
                {Object.entries(grouped).map(([group, list]) => (
                  <div key={group} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{group}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {list.map((r) => (
                        <button
                          key={r.room_id}
                          type="button"
                          onClick={() => setRoomId(r.room_id)}
                          className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm text-left ${
                            roomId === r.room_id ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <DoorOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">Room {r.room_number}</span>
                          </span>
                          <Badge variant="outline" className="shrink-0 font-normal">
                            {r.available_beds} of {r.capacity} beds free
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep('confirm')} disabled={!selected}>
                Continue <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{isBook ? 'Confirm your booking' : 'Confirm your upgrade'}</DialogTitle>
              <DialogDescription>
                Please review the details below — you&apos;re moved into this room immediately on confirm
                {!isBook && upgradeFee > 0 ? ', and the upgrade fee is billed.' : '.'}
              </DialogDescription>
            </DialogHeader>

            {selected && (
              <div className="space-y-3">
                <div className="rounded-md border divide-y text-sm">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">Category</span>
                    <span className="font-medium text-right">
                      {!isBook && currentCategoryName ? `${currentCategoryName} → ` : ''}{categoryName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">Room</span>
                    <span className="font-medium text-right">
                      {selected.block_name} · {floorLabel(selected.floor)} · Room {selected.room_number}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">Room capacity</span>
                    <span className="font-medium flex items-center gap-1.5">
                      <BedDouble className="h-4 w-4 text-muted-foreground" />
                      {selected.capacity} beds · {selected.available_beds} free
                    </span>
                  </div>
                  {!isBook && feeRow}
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  On confirm, this room is assigned to you immediately
                  {isBook ? (
                    '. Your hostel fee is raised by the hostel office.'
                  ) : upgradeFee > 0 ? (
                    <> and an upgrade bill of <span className="font-semibold">{inr(upgradeFee)}</span> is generated.</>
                  ) : (
                    '. No upgrade fee is due.'
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('pick')} disabled={upgrade.isPending}>
                Back
              </Button>
              <Button onClick={confirm} disabled={!selected || upgrade.isPending}>
                {upgrade.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isBook ? 'Book now' : 'Confirm upgrade'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
