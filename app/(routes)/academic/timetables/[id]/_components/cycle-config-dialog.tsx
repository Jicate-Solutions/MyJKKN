'use client';

// cycle-config-dialog.tsx
// Added: 2026-03-22 - Allows editing num_cycles for cycle-format timetables from the detail page
//
// Updated: 2026-09-10 (BUG-006085) - Also edits `start_cycle`, the day order the
// FIRST working day of the term carries. Before it existed a cycle timetable
// could only ever begin on Cycle 1, so a programme starting mid-term rotated
// permanently out of step with the rest of its college and there was no way to
// correct it short of misstating the start date. I M.SC CHEMISTRY started
// 18 Aug on Cycle 1 while the college was on Cycle 3, and stayed two behind.

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
import { CycleCalculationService } from '@/lib/services/academic/cycle-calculation-service';

interface CycleConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentNumCycles: number;
  /** `timetables.start_cycle`; null/undefined means the historic Cycle 1. */
  currentStartCycle?: number | null;
  /** Needed to look up the day order the rest of the college is on. */
  institutionId?: string | null;
  /** ISO "YYYY-MM-DD" — the term start, which is also the rotation anchor. */
  startDate?: string | null;
  /** This row's id, so it is not compared against itself. */
  timetableId?: string | null;
  hasSlots: boolean;
  isSuperAdmin: boolean;
  onSave: (numCycles: number, startCycle: number) => Promise<void>;
}

export function CycleConfigDialog({
  isOpen,
  onClose,
  currentNumCycles,
  currentStartCycle,
  institutionId,
  startDate,
  timetableId,
  hasSlots,
  isSuperAdmin,
  onSave
}: CycleConfigDialogProps) {
  const [numCycles, setNumCycles] = useState(currentNumCycles);
  const [startCycle, setStartCycle] = useState(currentStartCycle ?? 1);
  const [suggestedStartCycle, setSuggestedStartCycle] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when dialog opens with current value
  useEffect(() => {
    if (isOpen) {
      setNumCycles(currentNumCycles);
      setStartCycle(currentStartCycle ?? 1);
      setError(null);
    }
  }, [isOpen, currentNumCycles, currentStartCycle]);

  // What day order the rest of the college is on for this start date. Advisory:
  // a college can legitimately run a programme out of phase, so this offers a
  // value rather than imposing one.
  useEffect(() => {
    if (!isOpen || !institutionId || !startDate || !numCycles) {
      setSuggestedStartCycle(null);
      return;
    }

    let cancelled = false;

    CycleCalculationService.getAlignedStartCycle({
      institutionId,
      startDate,
      numCycles,
      excludeTimetableId: timetableId
    })
      .then((value) => {
        if (!cancelled) setSuggestedStartCycle(value);
      })
      .catch(() => {
        if (!cancelled) setSuggestedStartCycle(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, institutionId, startDate, numCycles, timetableId]);

  const handleSave = async () => {
    if (numCycles < 1 || numCycles > 52) {
      setError('Number of cycles must be between 1 and 52.');
      return;
    }

    if (startCycle < 1 || startCycle > numCycles) {
      setError(`Day order on start date must be between 1 and ${numCycles}.`);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(numCycles, startCycle);
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanged =
    numCycles !== currentNumCycles || startCycle !== (currentStartCycle ?? 1);

  // The slot guard is about REDUCING the cycle count, which can strand slots in
  // cycles the grid no longer draws. Changing the day order strands nothing — it
  // only shifts which cycle each future date reads — and gating it here would
  // leave a timetable found to be out of phase permanently uncorrectable, which
  // is the bug this control exists to fix (BUG-006085).
  const hasNumCyclesChanged = numCycles !== currentNumCycles;
  const showSlotWarning = hasSlots && hasNumCyclesChanged && !isSuperAdmin;
  const showSuperAdminWarning = hasSlots && hasNumCyclesChanged && isSuperAdmin;

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

          {/* Day order on the start date (BUG-006085) */}
          <div className='space-y-2'>
            <Label htmlFor='start-cycle'>Day order on start date</Label>
            <Input
              id='start-cycle'
              type='number'
              min={1}
              max={numCycles || currentNumCycles}
              value={startCycle}
              onChange={(e) => {
                setError(null);
                setStartCycle(parseInt(e.target.value, 10) || 1);
              }}
              className='w-full'
            />
            <p className='text-xs text-muted-foreground'>
              Which cycle the first working day of the term runs as. Leave it at
              1 unless this programme joins a rotation already under way — a
              timetable starting mid-term has to pick up the day order the rest
              of the college is on, or the same shared class shows at a
              different hour here than it does for everyone else.
            </p>

            {suggestedStartCycle !== null && suggestedStartCycle !== startCycle && (
              <div className='flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30'>
                <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400' />
                <div className='space-y-2 text-sm text-blue-800 dark:text-blue-200'>
                  <p>
                    The rest of this institution is on Cycle{' '}
                    {suggestedStartCycle} on this start date.
                  </p>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      setError(null);
                      setStartCycle(suggestedStartCycle);
                    }}
                  >
                    Use Cycle {suggestedStartCycle}
                  </Button>
                </div>
              </div>
            )}
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
