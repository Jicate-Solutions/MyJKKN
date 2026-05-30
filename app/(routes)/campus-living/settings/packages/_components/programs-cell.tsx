'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Globe, Users } from 'lucide-react';
import { ProgramAvailabilityDialog } from './program-availability-dialog';
import type { AdmissionPackage } from '@/types/admission-packages';

// Programs column cell: a compact badge button showing the package's current
// program availability (all vs N restricted) that opens the manage dialog.
// The count comes pre-computed from getPackages' embedded eligibility, so the
// table renders the state with no per-row query.
export function PackageProgramsCell({ pkg }: { pkg: AdmissionPackage }) {
  const [open, setOpen] = useState(false);
  const restrictedCount = pkg.restricted_program_count ?? 0;
  const restricted = restrictedCount > 0;

  return (
    <>
      <Button
        variant='outline'
        size='sm'
        className='h-7 gap-1.5 px-2 text-xs font-normal'
        onClick={() => setOpen(true)}
      >
        {restricted ? (
          <>
            <Users className='h-3 w-3' />
            {restrictedCount} program{restrictedCount === 1 ? '' : 's'}
          </>
        ) : (
          <>
            <Globe className='h-3 w-3' />
            All programs
          </>
        )}
      </Button>
      <ProgramAvailabilityDialog open={open} onOpenChange={setOpen} pkg={pkg} />
    </>
  );
}
