'use client';

// cycle-config-dialog.tsx
// Added: 2026-03-22 - Allows editing num_cycles for cycle-format timetables from the detail page

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CycleConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentNumCycles: number;
  hasSlots: boolean;
  isSuperAdmin: boolean;
  onSave: (numCycles: number) => Promise<void>;
}

export function CycleConfigDialog({
  isOpen,
  onClose,
  currentNumCycles,
  hasSlots,
  isSuperAdmin,
  onSave
}: CycleConfigDialogProps) {
  const [numCycles, setNumCycles] = useState(currentNumCycles);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when dialog opens with current value
  useEffect(() => {
    if (isOpen) {
      setNumCycles(currentNumCycles);
      setError(null);
    }
  }, [isOpen, currentNumCycles]);

  const handleSave = async () => {
    if (numCycles < 1 || numCycles > 52) {
      setError('Number of cycles must be between 1 and 52.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(numCycles);
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanged = numCycles !== currentNumCycles;
  const showSlotWarning = hasSlots && hasChanged && !isSuperAdmin;
  const showSuperAdminWarning = hasSlots && hasChanged && isSuperAdmin;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <RefreshCw className='h-5 w-5 text-amber-600' />
            Configure Cycles
          </DialogTitle>
          <DialogDescription>
            Set the total number of cycles that rotate through this timetable.
            The cycle counter advances only on working days — Sundays and
            approved holidays are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          {/* Current status */}
          <div className='flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3'>
            <span className='text-sm font-medium text-amber-900'>
              Current cycles
            </span>
            <Badge className='bg-amber-600 text-white text-sm'>
              {currentNumCycles} cycles
            </Badge>
          </div>

          {/* Input */}
          <div className='space-y-2'>
            <Label htmlFor='num-cycles'>Number of Cycles</Label>
            <Input
              id='num-cycles'
              type='number'
              min={1}
              max={52}
              value={numCycles}
              onChange={(e) => {
                setError(null);
                setNumCycles(parseInt(e.target.value, 10) || 1);
              }}
              className={cn(
                'w-full',
                error && 'border-red-500 focus-visible:ring-red-500'
              )}
            />
            <p className='text-xs text-muted-foreground'>
              Enter a value between 1 and 52. Each working day advances to the
              next cycle, wrapping back to Cycle 1 after Cycle {numCycles || currentNumCycles}.
            </p>
          </div>

          {/* Slot warning (non-superadmin) */}
          {showSlotWarning && (
            <div className='flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3'>
              <AlertCircle className='h-4 w-4 text-orange-600 mt-0.5 shrink-0' />
              <p className='text-sm text-orange-800'>
                This timetable has existing slots. Changing the cycle count
                may cause slots beyond the new limit to become unreachable.
                Contact an administrator to make this change.
              </p>
            </div>
          )}

          {/* Slot warning (superadmin override) */}
          {showSuperAdminWarning && (
            <div className='flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3'>
              <AlertCircle className='h-4 w-4 text-amber-600 mt-0.5 shrink-0' />
              <p className='text-sm text-amber-800'>
                <span className='font-semibold'>Admin override:</span> Existing
                slots will not be deleted, but slots beyond the new cycle count
                will no longer be visible in the grid.
              </p>
            </div>
          )}

          {error && (
            <p className='text-sm text-red-600 flex items-center gap-1'>
              <AlertCircle className='h-3.5 w-3.5' />
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanged || (showSlotWarning)}
            className='bg-amber-600 hover:bg-amber-700 text-white'
          >
            {saving ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Saving...
              </>
            ) : (
              'Save Cycles'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
