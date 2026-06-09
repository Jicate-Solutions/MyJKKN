'use client';

import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BedDouble, Loader2 } from 'lucide-react';
import { useUpgradeRoomBeds, useUpgradeRoom } from '@/hooks/campus-living/use-category-upgrade';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  currentFee: number;
  newFee: number;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function RoomUpgradeBedDialog({
  open, onOpenChange, categoryId, categoryName, currentFee, newFee,
}: Props) {
  const { data: beds = [], isLoading } = useUpgradeRoomBeds(open ? categoryId : null);
  const upgrade = useUpgradeRoom();
  const [bedId, setBedId] = useState('');

  const selected = beds.find((b) => b.bed_id === bedId) ?? null;

  const grouped = useMemo(
    () =>
      beds.reduce<Record<string, typeof beds>>((acc, b) => {
        const key = `${b.block_name} · ${b.floor === 0 ? 'Ground floor' : `Floor ${b.floor}`}`;
        (acc[key] ??= []).push(b);
        return acc;
      }, {}),
    [beds]
  );

  const confirm = async () => {
    if (!selected || upgrade.isPending) return;
    await upgrade.mutateAsync({ categoryId, roomId: selected.room_id, bedId: selected.bed_id });
    onOpenChange(false);
    setBedId('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setBedId(''); }}>
      <DialogContent className="w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upgrade to {categoryName}</DialogTitle>
          <DialogDescription>
            Pick an available bed. On confirm you move instantly and a new bill is generated:{' '}
            <span className="font-medium text-foreground">{inr(currentFee)} → {inr(newFee)}</span>.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground py-6">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading available beds…
          </div>
        ) : beds.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No available beds right now. Close this and choose "Join waitlist" instead.
          </p>
        ) : (
          <div className="space-y-4 max-h-[360px] overflow-y-auto">
            {Object.entries(grouped).map(([group, list]) => (
              <div key={group} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{group}</p>
                <div className="flex flex-wrap gap-2">
                  {list.map((b) => (
                    <button
                      key={b.bed_id}
                      type="button"
                      onClick={() => setBedId(b.bed_id)}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                        bedId === b.bed_id ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                      }`}
                    >
                      <BedDouble className="h-4 w-4 text-muted-foreground" />
                      {b.room_number} · Bed {b.bed_number}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upgrade.isPending}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!selected || upgrade.isPending}>
            {upgrade.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
