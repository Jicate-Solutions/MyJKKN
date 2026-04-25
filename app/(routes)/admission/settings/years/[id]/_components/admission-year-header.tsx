'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PenSquare } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import type { AdmissionYear } from '@/types/admission';

interface AdmissionYearHeaderProps {
  admissionYear: AdmissionYear;
}

export function AdmissionYearHeader({
  admissionYear
}: AdmissionYearHeaderProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canEdit =
    isSuperAdmin || canAccess('admission.settings.years', 'edit');

  return (
    <div className='flex justify-between items-center'>
      <div>
        <h1 className='text-2xl font-bold py-1'>
          {admissionYear.admission_year_name}
        </h1>
        <p className='text-sm sm:text-base text-muted-foreground'>
          Admission Year Details
        </p>
      </div>
      {canEdit && (
        <Button asChild>
          <Link href={`/admission/settings/years/${admissionYear.id}/edit`}>
            <PenSquare className='mr-2 h-4 w-4' />
            Edit Admission Year
          </Link>
        </Button>
      )}
    </div>
  );
}
