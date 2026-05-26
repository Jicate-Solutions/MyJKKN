'use client';
// app/(routes)/admin/hostel/allocations/_components/check-out-dialog.tsx
//
// Hostel rooms-v2 PR 4b (2026-05-26)
//
// Single-field check-out dialog. Re-uses roommate_preference_notes for
// any free-form vacate notes so we don't need a new column. The mutation
// sets check_out_date + actual_vacate_date — the partial UNIQUE index
// then frees the bed for re-allocation.

import { useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import { useCheckOutResident } from '@/hooks/campus-living/use-hostel-allocations';

export interface CheckOutDialogAllocation {
  id: string;
  learner_label: string;
  block_label: string;
  room_label: string;
  bed_label: string;
  check_in_date: string;
}

interface Props {
  allocation: CheckOutDialogAllocation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function CheckOutDialog({ allocation, open, onOpenChange }: Props) {
  const checkOut = useCheckOutResident();
  const [checkOutDate, setCheckOutDate] = useState(today());
  const [notes, setNotes] = useState('');

  // Reset transient state inside onOpenChange (per
  // react-hooks/set-state-in-effect lint + radix-dialog-race-fix memory).
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCheckOutDate(today());
      setNotes('');
    }
    onOpenChange(next);
  };

  if (!allocation) return null;

  const dateInvalid = checkOutDate < allocation.check_in_date;
  const canSubmit = Boolean(checkOutDate) && !dateInvalid && !checkOut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    checkOut.mutate(
      {
        id: allocation.id,
        check_out_date: checkOutDate,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-rose-600" />
            Check Out Resident
          </DialogTitle>
          <DialogDescription>
            Mark this allocation as checked out. The bed becomes available for re-allocation.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            <span className="text-muted-foreground">Learner</span>
            <span className="font-medium">{allocation.learner_label}</span>
            <span className="text-muted-foreground">Location</span>
            <span>
              {allocation.block_label} · Room {allocation.room_label} · Bed {allocation.bed_label}
            </span>
            <span className="text-muted-foreground">Checked in</span>
            <span className="tabular-nums">{allocation.check_in_date}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="co-date">Check-out date *</Label>
            <Input
              id="co-date"
              type="date"
              min={allocation.check_in_date}
              value={checkOutDate}
              onChange={(e) => setCheckOutDate(e.target.value)}
              required
            />
            {dateInvalid && (
              <p className="text-xs text-destructive">
                Check-out date must be on or after the check-in date.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co-notes">Notes (optional)</Label>
            <Textarea
              id="co-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason / context for the check-out"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {checkOut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Check Out
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
