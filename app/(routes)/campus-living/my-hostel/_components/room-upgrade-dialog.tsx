'use client';

import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, BedDouble, DoorOpen, Loader2 } from 'lucide-react';
import { useUpgradeRooms, useUpgradeRoom } from '@/hooks/campus-living/use-category-upgrade';
import type { UpgradeRoomOption } from '@/types/campus-living/category-upgrade';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  currentCategoryName: string | null;
  currentFee: number;
  newFee: number;
  upgradeFee: number;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const floorLabel = (floor: number) => (floor === 0 ? 'Ground floor' : `Floor ${floor}`);

export function RoomUpgradeDialog({
  open, onOpenChange, categoryId, categoryName, currentCategoryName, currentFee, newFee, upgradeFee,
}: Props) {
  const { data: rooms = [], isLoading } = useUpgradeRooms(open ? categoryId : null);
  const upgrade = useUpgradeRoom();
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

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto">
        {step === 'pick' ? (
          <>
            <DialogHeader>
              <DialogTitle>Upgrade to {categoryName}</DialogTitle>
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
                No available rooms right now. Close this and choose &quot;Join waitlist&quot; instead —
                you&apos;ll see the rooms here once one frees up.
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
              <DialogTitle>Confirm your upgrade</DialogTitle>
              <DialogDescription>
                Please review the details below — this happens instantly on confirm.
              </DialogDescription>
            </DialogHeader>

            {selected && (
              <div className="space-y-3">
                <div className="rounded-md border divide-y text-sm">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">Category</span>
                    <span className="font-medium text-right">
                      {currentCategoryName ? `${currentCategoryName} → ` : ''}{categoryName}
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
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">Yearly fee</span>
                    <span className="font-medium">{inr(currentFee)} → {inr(newFee)}</span>
                  </div>
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  You will be billed <span className="font-semibold">{inr(upgradeFee)}</span> for this
                  upgrade (as configured under Fee Config → Upgrade Fees). The bill is generated
                  automatically once you confirm, and a bed in this room is assigned to you.
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('pick')} disabled={upgrade.isPending}>
                Back
              </Button>
              <Button onClick={confirm} disabled={!selected || upgrade.isPending}>
                {upgrade.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm upgrade · Pay {inr(upgradeFee)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
