'use client';

// app/(routes)/billing/school-fees/new/page.tsx
//
// Create a fee plan for one class. Reached from the "+" on the class grid,
// which passes institution / year / program as query params — the three
// dimensions of the plan key, so they are fixed here rather than re-picked.

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { usePermissions } from '@/hooks/use-permissions';
import { useSchoolClasses } from '@/hooks/school-fees/use-school-fee-plans';
import { useAcademicYearsByInstitution } from '@/hooks/academic/use-academic-years';

import { SchoolFeesBreadcrumb } from '../_components/school-fees-breadcrumb';
import { PlanForm } from '../_components/plan-form';

function NewPlanContent() {
  const params = useSearchParams();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('school_fees', 'manage');

  const institutionId = params.get('institution') ?? '';
  const academicYearId = params.get('year') ?? '';
  const programId = params.get('program') ?? '';

  const { classes, loading: loadingClasses } = useSchoolClasses(institutionId || undefined);
  const { academicYears, loading: loadingYears } = useAcademicYearsByInstitution(
    institutionId || undefined,
  );

  const missing = !institutionId || !academicYearId || !programId;

  if (missing) {
    return (
      <Alert>
        <AlertTitle>Missing plan details</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            A fee plan is keyed to a school, a class and an academic year. Start from the plan list
            so all three are known.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/school-fees">Go to fee plans</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (loadingClasses || loadingYears) {
    return <Skeleton className="h-64 w-full" />;
  }

  const klass = classes.find((c) => c.id === programId);
  const year = (academicYears as Array<{ id: string; academic_year_name: string }>).find(
    (y) => y.id === academicYearId,
  );

  if (!klass || !year) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Class or academic year not found</AlertTitle>
        <AlertDescription>
          The class or year in the link no longer belongs to this school. Return to the plan list
          and try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <PlanForm
      mode="create"
      institutionId={institutionId}
      academicYearId={academicYearId}
      programId={programId}
      className={klass.program_name}
      yearName={year.academic_year_name}
      canEdit={canManage}
    />
  );
}

export default function NewSchoolFeePlanPage() {
  return (
    <PermissionGuard module="school_fees" action="manage">
      <ContentLayout title="New School Fee Plan">
        <div className="space-y-4">
          <SchoolFeesBreadcrumb leaf="New plan" />

          <div>
            <h1 className="text-2xl font-bold py-1">New Fee Plan</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Build the fee head × term grid. Leave a cell blank where a head is not charged that
              term.
            </p>
          </div>

          <NewPlanContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
