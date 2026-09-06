'use client';

// clone-year-dialog.tsx
//
// "Clone 2025-26 → 2026-27" — copies every ACTIVE plan for the school into the
// target year as drafts, then the office retypes only the cells that changed.
// This is the normal year-on-year path; the Excel importer (Phase 8) is for
// onboarding a school that has no previous year in the system.
//
// Plain shadcn <Select>, not <SearchableSelect>: the cmdk popover races Radix's
// Dialog focus trap and its clicks fail silently inside a modal.

import { useMemo, useState } from 'react';
import { CopyPlus } from 'lucide-react';

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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { SchoolYearOption } from '@/hooks/school-fees/use-school-year-selection';

interface CloneYearDialogProps {
  years: SchoolYearOption[];
  targetAcademicYearId: string;
  disabled?: boolean;
  onClone: (fromAcademicYearId: string) => Promise<unknown>;
}

export function CloneYearDialog({
  years,
  targetAcademicYearId,
  disabled,
  onClone,
}: CloneYearDialogProps) {
  const [open, setOpen] = useState(false);
  const [sourceYearId, setSourceYearId] = useState('');
  const [busy, setBusy] = useState(false);

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
      await onClone(sourceYearId);
      setOpen(false);
      setSourceYearId('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <CopyPlus className="h-4 w-4 mr-1" />
          Clone from another year
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Clone fee plans</DialogTitle>
          <DialogDescription>
            Copy every active plan into {targetName} as drafts, then edit the amounts that changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="clone-plans-source">Copy from</Label>
            <Select value={sourceYearId} onValueChange={setSourceYearId}>
              <SelectTrigger id="clone-plans-source">
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
                No other academic year is available for this school.
              </p>
            ) : null}
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              Classes that already have a plan in {targetName} are skipped, never duplicated — so
              running this twice is safe. Cloned plans arrive as <strong>drafts</strong> and are not
              used for billing until activated.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleClone} disabled={!sourceYearId || busy}>
            {busy ? 'Cloning…' : 'Clone plans'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
