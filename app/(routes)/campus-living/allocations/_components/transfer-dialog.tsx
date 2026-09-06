'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useBedsByRoom } from '@/hooks/campus-living/use-hostel-beds';
import {
  useTransferAllocation,
  useTransferRoomOptions,
} from '@/hooks/campus-living/use-hostel-allocations';
import { ArrowRightLeft, Loader2, BedDouble } from 'lucide-react';

interface TransferDialogProps {
  allocationId: string;
  currentBlockId?: string | null;
  currentRoomId?: string | null;
  currentBedId?: string | null;
  /** Display-only summary of where the learner currently lives. */
  current?: {
    learnerName?: string | null;
    blockName?: string | null;
    roomNumber?: string | null;
    bedNumber?: string | null;
    roomCategory?: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const ALL_CATEGORIES = '__all__';

export function TransferDialog({
  allocationId,
  currentBlockId,
  currentRoomId,
  currentBedId,
  current,
  open,
  onOpenChange,
  onSuccess,
}: TransferDialogProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const transferMutation = useTransferAllocation();

  // Start on the learner's current block so its availability shows immediately.
  const [blockId, setBlockId] = useState<string>(currentBlockId ?? '');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [roomId, setRoomId] = useState<string>('');
  const [bedId, setBedId] = useState<string>('');

  const { data: blocksResult } = useHostelBlocks(profile?.institution_id ?? '');
  const blocks = (blocksResult as any)?.data ?? [];

  // Category-wise room/bed availability for the chosen block.
  const { data: roomOptions = [], isLoading: roomsLoading } =
    useTransferRoomOptions(blockId || undefined);
  const { data: beds } = useBedsByRoom(roomId);

  // Reset the cascade whenever the block changes.
  useEffect(() => {
    setCategoryFilter(ALL_CATEGORIES);
    setRoomId('');
    setBedId('');
  }, [blockId]);

  // Per-category rollup shown as chips so the admin sees availability at a glance.
  const categorySummary = useMemo(() => {
    const map = new Map<
      string,
      { name: string; freeBeds: number; roomsWithFree: number; totalRooms: number }
    >();
    for (const r of roomOptions) {
      const name = r.category_name ?? 'Uncategorised';
      const e = map.get(name) ?? { name, freeBeds: 0, roomsWithFree: 0, totalRooms: 0 };
      e.freeBeds += Number(r.free_beds) || 0;
      e.totalRooms += 1;
      if ((Number(r.free_beds) || 0) > 0) e.roomsWithFree += 1;
      map.set(name, e);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [roomOptions]);

  const categoryNames = useMemo(
    () => categorySummary.map((c) => c.name),
    [categorySummary],
  );

  // Selectable rooms: those with a free bed (plus the learner's current room so
  // a within-room bed change is possible), narrowed by the category filter.
  const visibleRooms = useMemo(() => {
    return roomOptions.filter((r) => {
      const name = r.category_name ?? 'Uncategorised';
      if (categoryFilter !== ALL_CATEGORIES && name !== categoryFilter) return false;
      return (Number(r.free_beds) || 0) > 0 || r.room_id === currentRoomId;
    });
  }, [roomOptions, categoryFilter, currentRoomId]);

  const availableBeds = ((beds as any) ?? []).filter(
    (b: any) => b.status === 'available' || b.id === currentBedId,
  );

  const sameLocation =
    blockId === currentBlockId && roomId === currentRoomId && bedId === currentBedId;
  const isDisabled =
    !blockId || !roomId || !bedId || sameLocation || transferMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDisabled) return;

    await transferMutation.mutateAsync({
      id: allocationId,
      payload: {
        new_room_id: roomId,
        new_bed_id: bedId,
        new_block_id: blockId,
      },
    });

    onOpenChange(false);
    setBlockId('');
    setCategoryFilter(ALL_CATEGORIES);
    setRoomId('');
    setBedId('');
    if (onSuccess) onSuccess();
    else router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              Change Room / Bed
            </DialogTitle>
            <DialogDescription>
              Move {current?.learnerName ? <strong>{current.learnerName}</strong> : 'this resident'}{' '}
              to a different room / bed. This is a physical move only — it does not
              change their room/mess category.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Current allocation */}
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current allocation
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <KV label="Block" value={current?.blockName} />
                <KV label="Room" value={current?.roomNumber} />
                <KV label="Bed" value={current?.bedNumber} />
                <KV label="Room category" value={current?.roomCategory} />
              </div>
            </div>

            {/* Target block */}
            <div className="space-y-2">
              <Label htmlFor="tr-block">
                Target Block <span className="text-destructive">*</span>
              </Label>
              <Select value={blockId} onValueChange={setBlockId}>
                <SelectTrigger id="tr-block">
                  <SelectValue placeholder="Select block" />
                </SelectTrigger>
                <SelectContent>
                  {blocks.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.code ? `(${b.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Availability by category (chips) */}
            {blockId && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Availability by category
                </p>
                {roomsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : categorySummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rooms in this block.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categorySummary.map((c) => {
                      const has = c.freeBeds > 0;
                      return (
                        <Badge
                          key={c.name}
                          variant={has ? 'secondary' : 'outline'}
                          className={has ? '' : 'opacity-60'}
                        >
                          <BedDouble className="mr-1 h-3 w-3" />
                          {c.name}: {c.freeBeds} free
                          {has ? ` · ${c.roomsWithFree} room${c.roomsWithFree === 1 ? '' : 's'}` : ''}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Category filter */}
            {blockId && categoryNames.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="tr-cat">Filter rooms by category</Label>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => {
                    setCategoryFilter(v);
                    setRoomId('');
                    setBedId('');
                  }}
                >
                  <SelectTrigger id="tr-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                    {categoryNames.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Target room (shows free-bed counts) */}
            <div className="space-y-2">
              <Label htmlFor="tr-room">
                Target Room <span className="text-destructive">*</span>
              </Label>
              <Select
                value={roomId}
                onValueChange={(v) => {
                  setRoomId(v);
                  setBedId('');
                }}
                disabled={!blockId || roomsLoading}
              >
                <SelectTrigger id="tr-room">
                  <SelectValue
                    placeholder={
                      !blockId
                        ? 'Pick a block first'
                        : visibleRooms.length === 0
                          ? 'No rooms with free beds'
                          : 'Select room'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {visibleRooms.map((r) => (
                    <SelectItem key={r.room_id} value={r.room_id}>
                      Room {r.room_number}
                      {r.category_name ? ` · ${r.category_name}` : ''}
                      {' · '}
                      {Number(r.free_beds) || 0}/{Number(r.total_beds) || 0} free
                      {r.room_id === currentRoomId ? ' · current' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target bed */}
            <div className="space-y-2">
              <Label htmlFor="tr-bed">
                Target Bed <span className="text-destructive">*</span>
              </Label>
              <Select value={bedId} onValueChange={setBedId} disabled={!roomId}>
                <SelectTrigger id="tr-bed">
                  <SelectValue placeholder={roomId ? 'Select bed' : 'Pick a room first'} />
                </SelectTrigger>
                <SelectContent>
                  {availableBeds.map((bed: any) => (
                    <SelectItem key={bed.id} value={bed.id}>
                      Bed {bed.bed_number} {bed.bed_type ? `· ${bed.bed_type}` : ''}
                      {bed.id === currentBedId ? ' · current' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roomId && availableBeds.length === 0 && (
                <p className="text-xs text-amber-600">No free beds in this room.</p>
              )}
            </div>

            {sameLocation && blockId && (
              <p className="text-xs text-amber-600">
                Same block / room / bed as current — change at least one to transfer.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={transferMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isDisabled}>
              {transferMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Move
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KV({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value || '—'}</span>
    </div>
  );
}
