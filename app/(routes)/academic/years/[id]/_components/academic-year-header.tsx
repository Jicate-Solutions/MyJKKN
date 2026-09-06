'use client';
/**
 * Client-side Header Component for Academic Year Details
 *
 * Handles permission-based UI (edit button) which requires client-side execution.
 */


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
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold py-1 break-words">
          {academicYear.academic_year_name}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Academic Year Details
        </p>
      </div>
      {canEditAcademicYear && (
        <Button asChild className="shrink-0">
          <Link href={`/academic/years/${academicYear.id}/edit`}>
            <PenSquare className="mr-2 h-4 w-4" />
            Edit Academic Year
          </Link>
        </Button>
      )}
    </div>
  );
}
