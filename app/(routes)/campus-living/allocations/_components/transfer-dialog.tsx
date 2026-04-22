'use client';

import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useRoomsByBlock } from '@/hooks/campus-living/use-hostel-rooms';
import { useBedsByRoom } from '@/hooks/campus-living/use-hostel-beds';
import { useTransferAllocation } from '@/hooks/campus-living/use-hostel-allocations';
import { ArrowRightLeft, Loader2 } from 'lucide-react';

interface TransferDialogProps {
  allocationId: string;
  currentBlockId?: string | null;
  currentRoomId?: string | null;
  currentBedId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function TransferDialog({
  allocationId,
  currentBlockId,
  currentRoomId,
  currentBedId,
  open,
  onOpenChange,
  onSuccess,
}: TransferDialogProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const transferMutation = useTransferAllocation();

  const [blockId, setBlockId] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [bedId, setBedId] = useState<string>('');

  const { data: blocksResult } = useHostelBlocks(profile?.institution_id ?? '');
  const blocks = (blocksResult as any)?.data ?? [];
  const { data: rooms } = useRoomsByBlock(blockId);
  const { data: beds } = useBedsByRoom(roomId);

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
    setRoomId('');
    setBedId('');
    if (onSuccess) onSuccess();
    else router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[520px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              Transfer Allocation
            </DialogTitle>
            <DialogDescription>
              Move this resident to a different block / room / bed. Current status stays
              Active; allocation_type will be marked as <em>transfer</em>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tr-block">
                Block <span className="text-destructive">*</span>
              </Label>
              <Select
                value={blockId}
                onValueChange={(v) => {
                  setBlockId(v);
                  setRoomId('');
                  setBedId('');
                }}
              >
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

            <div className="space-y-2">
              <Label htmlFor="tr-room">
                Room <span className="text-destructive">*</span>
              </Label>
              <Select
                value={roomId}
                onValueChange={(v) => {
                  setRoomId(v);
                  setBedId('');
                }}
                disabled={!blockId}
              >
                <SelectTrigger id="tr-room">
                  <SelectValue
                    placeholder={blockId ? 'Select room' : 'Pick a block first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {((rooms as any) ?? []).map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>
                      Room {r.room_number} {r.room_type ? `· ${r.room_type}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tr-bed">
                Bed <span className="text-destructive">*</span>
              </Label>
              <Select value={bedId} onValueChange={setBedId} disabled={!roomId}>
                <SelectTrigger id="tr-bed">
                  <SelectValue
                    placeholder={roomId ? 'Select bed' : 'Pick a room first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {((beds as any) ?? []).map((bed: any) => (
                    <SelectItem key={bed.id} value={bed.id}>
                      Bed {bed.bed_number} {bed.bed_type ? `· ${bed.bed_type}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {transferMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm Transfer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
