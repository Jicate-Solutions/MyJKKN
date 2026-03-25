/**
 * Client-side Header Component for Academic Year Details
 *
 * Handles permission-based UI (edit button) which requires client-side execution.
 */

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PenSquare } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import type { AcademicYear } from '@/types/academics';

interface AcademicYearHeaderProps {
  academicYear: AcademicYear;
}

export function AcademicYearHeader({ academicYear }: AcademicYearHeaderProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  // Permission checks (client-side)
  const canEditAcademicYear =
    isSuperAdmin || canAccess('academic.years', 'edit');

  return (
    <div className="flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-bold py-1">
          {academicYear.academic_year_name}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Academic Year Details
        </p>
      </div>
      {canEditAcademicYear && (
        <Button asChild>
          <Link href={`/academic/years/${academicYear.id}/edit`}>
            <PenSquare className="mr-2 h-4 w-4" />
            Edit Academic Year
          </Link>
        </Button>
      )}
    </div>
  );
}
