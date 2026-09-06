'use client';

// ============================================================================
// Premium Room Phase 2 — Override Allocation Dialog
// ============================================================================
// Modal for a chief warden to forcibly re-tier or re-bed a premium allocation.
// Override reason is mandatory (enforced server-side by RLS + client-side
// here for early feedback).
// ============================================================================

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useHostelTiers } from '@/hooks/campus-living/use-hostel-tier-policy';
import { useOverridePremiumAllocation } from '@/hooks/campus-living/use-premium-audit';
import type { PremiumAllocationSummary } from '@/types/campus-living/premium-audit';

interface Props {
  allocation: PremiumAllocationSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}

const MIN_REASON_LEN = 10;

export function OverrideAllocationDialog({
  allocation,
  open,
  onOpenChange,
  onApplied,
}: Props) {
  const [reason, setReason] = useState('');
  const [newTierId, setNewTierId] = useState<string>('');
  const [newBlockId, setNewBlockId] = useState<string>('');
  const [newRoomId, setNewRoomId] = useState<string>('');
  const [newBedId, setNewBedId] = useState<string>('');

  // Use the allocation's institution to scope tier lookup (global + override
  // rows for that institution).
  const tiersQuery = useHostelTiers(allocation?.institution_id ?? null);
  const overrideMutation = useOverridePremiumAllocation();

  // Reset form when allocation changes.
  useEffect(() => {
    setReason('');
    setNewTierId('');
    setNewBlockId('');
    setNewRoomId('');
    setNewBedId('');
  }, [allocation?.allocation_id]);

  if (!allocation) return null;

  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= MIN_REASON_LEN;
  const anyChange =
    Boolean(newTierId) || Boolean(newBlockId) || Boolean(newRoomId) || Boolean(newBedId);
  const canSubmit = reasonValid && (anyChange || /reason-only/i.test('')); // see note below
  // ^ For this iteration: require a change to at least one of tier/block/room/bed
  // — a "reason without any change" doesn't move the learner. Director can
  // relax this later via a "record-only override" UX if needed.
  const submitEnabled = reasonValid && anyChange && !overrideMutation.isPending;

  const handleSubmit = async () => {
    if (!submitEnabled || !allocation) return;
    const result = await overrideMutation.mutateAsync({
      allocationId: allocation.allocation_id,
      overrideReason: trimmedReason,
      newTierId: newTierId || null,
      newBlockId: newBlockId || null,
      newRoomId: newRoomId || null,
      newBedId: newBedId || null,
    });
    if (result.success) onApplied();
  };

  const activeTiers = (tiersQuery.data ?? [])
    .filter((t) => t.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Override allocation</DialogTitle>
          <DialogDescription>
            Forcibly re-tier or re-bed{' '}
            <strong>{allocation.learner_name ?? allocation.learner_email ?? 'this learner'}</strong>
            . The reason is mandatory and is recorded permanently in the audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div>
              <strong>Current:</strong> {allocation.tier_display_name ?? allocation.tier_key ?? '—'} ·{' '}
              {allocation.block_name ?? '—'} / Room {allocation.room_number ?? '—'} / Bed{' '}
              {allocation.bed_number ?? '—'}
            </div>
            {allocation.override_reason && (
              <div className="mt-1 text-muted-foreground">
                <strong>Previous override:</strong> {allocation.override_reason}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="override-tier">New tier (optional)</Label>
              <Select
                value={newTierId}
                onValueChange={setNewTierId}
                disabled={tiersQuery.isLoading}
              >
                <SelectTrigger id="override-tier">
                  <SelectValue placeholder="Keep current tier" />
                </SelectTrigger>
                <SelectContent>
                  {activeTiers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.tier_display_name} ({t.tier_key})
                      {t.institution_id === null ? ' · default' : ' · override'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="override-block">New block ID (optional)</Label>
              <Input
                id="override-block"
                placeholder="hostel_blocks.id"
                value={newBlockId}
                onChange={(e) => setNewBlockId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="override-room">New room ID (optional)</Label>
              <Input
                id="override-room"
                placeholder="hostel_rooms.id"
                value={newRoomId}
                onChange={(e) => setNewRoomId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="override-bed">New bed ID (optional)</Label>
              <Input
                id="override-bed"
                placeholder="hostel_beds.id"
                value={newBedId}
                onChange={(e) => setNewBedId(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Pasting raw block / room / bed IDs is intentional for Phase 2. The
            chief-warden flow on mobile will get block / room / bed pickers in a
            later iteration. For now, copy IDs from the Campus Living admin
            panel.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="override-reason">
              Reason (required, min {MIN_REASON_LEN} characters)
            </Label>
            <Textarea
              id="override-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Medical accommodation — learner has back injury; moving from upper bunk to ground floor room 102 on parents' request (call ref CW-1438)."
              aria-invalid={!reasonValid && reason.length > 0}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {trimmedReason.length} / {MIN_REASON_LEN} characters minimum
              </span>
              {!anyChange && (
                <span className="text-amber-600 dark:text-amber-400">
                  Choose a new tier OR paste at least one ID to apply a move.
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={overrideMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!submitEnabled}>
            {overrideMutation.isPending ? 'Applying…' : 'Apply override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
