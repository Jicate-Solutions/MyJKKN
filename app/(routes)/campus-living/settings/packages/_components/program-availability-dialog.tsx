'use client';

// Per-package program-availability manager.
//
// A package is offered to programs via rows in admission_package_program_eligibility:
//   - a row with program_id = NULL  → available to ALL programs (the default a
//     brand-new package gets on create).
//   - one or more rows with concrete program_id → restricted to those programs.
// Restricting therefore means: drop the NULL row, add the specific program(s).
// Removing the last specific program reverts to "available to all" so a package
// is never silently offered to nobody.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Loader2, X, Globe, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePackageProgramEligibility } from '@/hooks/campus-living/use-admission-packages';
import { useProgramsForInstitution } from '@/hooks/campus-living/use-program-eligibility';
import type { AdmissionPackage } from '@/types/admission-packages';

interface ProgramAvailabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: AdmissionPackage;
}

export function ProgramAvailabilityDialog({
  open,
  onOpenChange,
  pkg,
}: ProgramAvailabilityDialogProps) {
  // gate the queries on `open` so we don't fetch eligibility for every row's
  // (closed) dialog — only the package whose dialog is actually open loads.
  const { rows, loading, addProgram, removeProgram } =
    usePackageProgramEligibility(open ? pkg.id : null);
  const { programs } = useProgramsForInstitution(
    open ? pkg.institution_id : null
  );

  const [selectedProgram, setSelectedProgram] = useState('');
  const [busy, setBusy] = useState(false);

  const allRow = rows.find((r) => r.program_id === null) ?? null;
  const specificRows = rows.filter((r) => r.program_id !== null);
  const isAllPrograms = Boolean(allRow) && specificRows.length === 0;

  const nameFor = (programId: string) =>
    programs.find((p) => p.id === programId)?.program_name ?? 'Unknown program';

  // hide already-added programs from the picker
  const addedIds = new Set(specificRows.map((r) => r.program_id as string));
  const programOptions = programs
    .filter((p) => !addedIds.has(p.id))
    .map((p) => ({ value: p.id, label: p.program_name }));

  const handleAdd = async () => {
    if (!selectedProgram) return;
    try {
      setBusy(true);
      // first restriction: drop the "all programs" row so it takes effect
      if (allRow) await removeProgram(allRow.id);
      await addProgram(selectedProgram);
      setSelectedProgram('');
      toast.success('Program added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add program');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (rowId: string) => {
    try {
      setBusy(true);
      const remaining = specificRows.filter((r) => r.id !== rowId);
      await removeProgram(rowId);
      // removing the last specific program reverts to "available to all"
      if (remaining.length === 0 && !allRow) {
        await addProgram(null);
      }
      toast.success('Program removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove program');
    } finally {
      setBusy(false);
    }
  };

  const handleResetToAll = async () => {
    try {
      setBusy(true);
      for (const r of specificRows) {
        await removeProgram(r.id);
      }
      if (!allRow) await addProgram(null);
      toast.success('Available to all programs');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>Program Availability</DialogTitle>
          <DialogDescription>
            Control which programs can be offered &ldquo;{pkg.name}&rdquo;. By
            default a package is available to all programs; add specific programs
            to restrict it.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {loading ? (
            <div className='flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' /> Loading…
            </div>
          ) : (
            <>
              {/* current state */}
              {isAllPrograms ? (
                <div className='flex items-center gap-3 rounded-lg border bg-muted/30 p-4'>
                  <Globe className='h-4 w-4 shrink-0 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-medium'>
                      Available to all programs
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      Add a program below to restrict this package.
                    </p>
                  </div>
                </div>
              ) : specificRows.length > 0 ? (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <p className='text-sm font-medium'>
                      Restricted to {specificRows.length} program
                      {specificRows.length === 1 ? '' : 's'}
                    </p>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={handleResetToAll}
                      disabled={busy}
                    >
                      Reset to all
                    </Button>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {specificRows.map((r) => (
                      <Badge
                        key={r.id}
                        variant='secondary'
                        className='gap-1 pr-1'
                      >
                        {nameFor(r.program_id as string)}
                        <button
                          type='button'
                          onClick={() => handleRemove(r.id)}
                          disabled={busy}
                          className='ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50'
                          aria-label={`Remove ${nameFor(r.program_id as string)}`}
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <div className='rounded-lg border border-amber-300 bg-amber-50 p-4'>
                  <p className='text-sm text-amber-800'>
                    This package is currently available to no programs. Add a
                    program or make it available to all.
                  </p>
                  <Button
                    variant='outline'
                    size='sm'
                    className='mt-2'
                    onClick={handleResetToAll}
                    disabled={busy}
                  >
                    Make available to all
                  </Button>
                </div>
              )}

              {/* add a program */}
              <div className='space-y-2'>
                <p className='text-sm font-medium'>Add a program</p>
                <div className='flex items-center gap-2'>
                  <div className='flex-1'>
                    <SearchableSelect
                      value={selectedProgram}
                      onValueChange={setSelectedProgram}
                      options={programOptions}
                      placeholder={
                        programOptions.length
                          ? 'Select a program'
                          : 'All programs already added'
                      }
                      disabled={busy || programOptions.length === 0}
                      modal
                    />
                  </div>
                  <Button
                    type='button'
                    onClick={handleAdd}
                    disabled={busy || !selectedProgram}
                  >
                    {busy ? (
                      <Loader2 className='h-4 w-4 animate-spin' />
                    ) : (
                      <Plus className='h-4 w-4' />
                    )}
                  </Button>
                </div>
                <p className='text-xs text-muted-foreground'>
                  Adding the first program switches this package from &ldquo;all
                  programs&rdquo; to a restricted list.
                </p>
              </div>
            </>
          )}

          <div className='flex justify-end pt-2'>
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
