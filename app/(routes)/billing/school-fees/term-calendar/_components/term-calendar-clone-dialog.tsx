'use client';

// term-calendar-clone-dialog.tsx
//
// Copy last year's calendar forward, shifting every date by a whole number of
// days. Retyping three due dates AND three fine dates is exactly the chore that
// makes operators skip the fine dates entirely, which silently disables fines
// for the year.
//
// Uses the plain shadcn <Select> rather than <SearchableSelect>: the cmdk-based
// popover races Radix's Dialog focus trap and its clicks fail silently inside a
// modal. The year list is short enough that a plain select is also the better
// control.

import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AcademicYearOption {
  id: string;
  academic_year_name: string;
}

interface TermCalendarCloneDialogProps {
  years: AcademicYearOption[];
  targetAcademicYearId: string;
  disabled?: boolean;
  onClone: (fromAcademicYearId: string, shiftDays: number) => Promise<unknown>;
}

/** 365 keeps the same weekday-ish position; a leap year needs 366. */
const DEFAULT_SHIFT_DAYS = 365;

export function TermCalendarCloneDialog({
  years,
  targetAcademicYearId,
  disabled,
  onClone,
}: TermCalendarCloneDialogProps) {
  const [open, setOpen] = useState(false);
  const [sourceYearId, setSourceYearId] = useState('');
  const [shiftDays, setShiftDays] = useState(DEFAULT_SHIFT_DAYS);
  const [busy, setBusy] = useState(false);

  // Cloning a year onto itself would overwrite the source with a shifted copy.
  const sourceOptions = useMemo(
    () => years.filter((y) => y.id !== targetAcademicYearId),
    [years, targetAcademicYearId],
  );

  const targetName =
    years.find((y) => y.id === targetAcademicYearId)?.academic_year_name ?? 'the selected year';

  async function handleClone() {
    if (!sourceYearId) return;
    setBusy(true);
    try {
      await onClone(sourceYearId, shiftDays);
      setOpen(false);
      setSourceYearId('');
      setShiftDays(DEFAULT_SHIFT_DAYS);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <CalendarClock className="h-4 w-4 mr-1" />
          Clone from another year
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Clone term calendar</DialogTitle>
          <DialogDescription>
            Copy an existing year&apos;s terms into {targetName}, shifting every date forward.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="clone-source-year">Copy from</Label>
            <Select value={sourceYearId} onValueChange={setSourceYearId}>
              <SelectTrigger id="clone-source-year">
                <SelectValue placeholder="Select an academic year" />
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.academic_year_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sourceOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No other academic year is available for this institution.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="clone-shift-days">Shift every date by (days)</Label>
            <Input
              id="clone-shift-days"
              type="number"
              value={shiftDays}
              onChange={(e) => setShiftDays(e.target.value === '' ? 0 : Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              365 moves each date one year forward. Use 366 when the span crosses a leap year.
            </p>
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              This replaces any terms already defined for {targetName}. Review every date afterwards
              — a shifted date can land on a holiday or a weekend.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleClone} disabled={!sourceYearId || busy}>
            {busy ? 'Cloning…' : 'Clone calendar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
