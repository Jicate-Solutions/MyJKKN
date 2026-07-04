'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useResetAllocation } from '@/hooks/campus-living/use-hostel-allocations';
import { Loader2, RotateCcw } from 'lucide-react';

interface ResetAllocationDialogProps {
  allocationId: string;
  current: {
    learnerName: string | null;
    blockName: string | null;
    roomNumber: string | null;
    bedNumber: string | null;
    roomCategory: string | null;
    messCategory: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Admin "Reset" modal: pick one or more of allocated room / room category /
// mess category to clear. Room reset hard-deletes the allocation and frees the
// bed (the learner returns to the Not Allocated tab); category resets NULL the
// learner-level columns on learners_profiles. All applied atomically via
// fn_cl_admin_reset_allocation.
export function ResetAllocationDialog({
  allocationId,
  current,
  open,
  onOpenChange,
  onSuccess,
}: ResetAllocationDialogProps) {
  const resetMutation = useResetAllocation();

  const [resetRoom, setResetRoom] = useState(false);
  const [resetRoomCategory, setResetRoomCategory] = useState(false);
  const [resetMessCategory, setResetMessCategory] = useState(false);

  // Fresh choices each time the modal opens for a row.
  useEffect(() => {
    if (open) {
      setResetRoom(false);
      setResetRoomCategory(false);
      setResetMessCategory(false);
    }
  }, [open, allocationId]);

  const hasRoom = !!(current.roomNumber || current.bedNumber);
  const hasRoomCategory = !!current.roomCategory;
  const hasMessCategory = !!current.messCategory;

  const nothingSelected = !resetRoom && !resetRoomCategory && !resetMessCategory;
  const isDisabled = nothingSelected || resetMutation.isPending;

  const roomLabel = [
    current.blockName,
    current.roomNumber ? `Room ${current.roomNumber}` : null,
    current.bedNumber ? `Bed ${current.bedNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nothingSelected) return;

    await resetMutation.mutateAsync({
      id: allocationId,
      payload: { resetRoom, resetRoomCategory, resetMessCategory },
    });

    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[520px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Reset Allocation
            </DialogTitle>
            <DialogDescription>
              {current.learnerName ? (
                <>
                  Choose what to reset for{' '}
                  <span className="font-medium text-foreground">{current.learnerName}</span>. You
                  can select one or several options.
                </>
              ) : (
                'Choose what to reset. You can select one or several options.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {/* Allocated room */}
            <label
              htmlFor="reset-room"
              className={`flex items-start gap-3 rounded-md border p-3 ${
                hasRoom ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60'
              }`}
            >
              <Checkbox
                id="reset-room"
                checked={resetRoom}
                onCheckedChange={(c) => setResetRoom(c === true)}
                disabled={!hasRoom || resetMutation.isPending}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <span className="text-sm font-medium leading-none">
                  Allocated room
                  {roomLabel && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {roomLabel}
                    </span>
                  )}
                </span>
                <p className="text-xs text-muted-foreground">
                  {hasRoom
                    ? 'Deletes this allocation and frees the bed. The learner moves back to the Not Allocated tab and can be allocated again.'
                    : 'No room/bed on this allocation — nothing to reset.'}
                </p>
              </div>
            </label>

            {/* Room category */}
            <label
              htmlFor="reset-room-category"
              className={`flex items-start gap-3 rounded-md border p-3 ${
                hasRoomCategory ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60'
              }`}
            >
              <Checkbox
                id="reset-room-category"
                checked={resetRoomCategory}
                onCheckedChange={(c) => setResetRoomCategory(c === true)}
                disabled={!hasRoomCategory || resetMutation.isPending}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <span className="text-sm font-medium leading-none">
                  Room category
                  {current.roomCategory && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {current.roomCategory}
                    </span>
                  )}
                </span>
                <p className="text-xs text-muted-foreground">
                  {hasRoomCategory
                    ? "Clears the learner's room category."
                    : 'No room category set — nothing to reset.'}
                </p>
              </div>
            </label>

            {/* Mess category */}
            <label
              htmlFor="reset-mess-category"
              className={`flex items-start gap-3 rounded-md border p-3 ${
                hasMessCategory ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60'
              }`}
            >
              <Checkbox
                id="reset-mess-category"
                checked={resetMessCategory}
                onCheckedChange={(c) => setResetMessCategory(c === true)}
                disabled={!hasMessCategory || resetMutation.isPending}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <span className="text-sm font-medium leading-none">
                  Mess category
                  {current.messCategory && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {current.messCategory}
                    </span>
                  )}
                </span>
                <p className="text-xs text-muted-foreground">
                  {hasMessCategory
                    ? "Clears the learner's mess category."
                    : 'No mess category set — nothing to reset.'}
                </p>
              </div>
            </label>

            <p className="text-xs text-muted-foreground">
              Note: categories may be re-derived automatically (from a new allocation or from fee
              bands when academic bills are written).
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={resetMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isDisabled}>
              {resetMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset selected
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
