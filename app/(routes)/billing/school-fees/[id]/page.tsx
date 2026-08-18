'use client';

// app/(routes)/billing/school-fees/[id]/page.tsx
//
// View or edit one class's fee grid. A locked plan (bills already generated)
// renders read-only — PlanForm shows the explanation and disables every input.

import { use } from 'react';
import Link from 'next/link';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { usePermissions } from '@/hooks/use-permissions';
import { useSchoolFeePlan } from '@/hooks/school-fees/use-school-fee-plans';

import { SchoolFeesBreadcrumb } from '../_components/school-fees-breadcrumb';
import { PlanForm } from '../_components/plan-form';
import { ClassFeePreview } from '../_components/class-fee-preview';

function PlanDetail({ id }: { id: string }) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('school_fees', 'manage');
  const { plan, loading, error } = useSchoolFeePlan(id);

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (error || !plan) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Fee plan not found</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error ?? 'This plan may have been deleted, or you may not have access to it.'}</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/school-fees">Back to fee plans</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const className = plan.program?.program_name ?? 'Class';

  return (
    <div className="space-y-6">
      <PlanForm
        mode="edit"
        institutionId={plan.institution_id}
        academicYearId={plan.academic_year_id}
        programId={plan.program_id}
        className={className}
        yearName={plan.academic_year?.academic_year_name ?? 'Academic year'}
        plan={plan}
        canEdit={canManage}
      />

      {/* Only meaningful once the plan is live — an inactive plan resolves to
          "no active plan" for every learner in the class. */}
      {plan.status === 'active' ? (
        <ClassFeePreview
          institutionId={plan.institution_id}
          programId={plan.program_id}
          academicYearId={plan.academic_year_id}
          className={className}
        />
      ) : null}
    </div>
  );
}

export default function SchoolFeePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <PermissionGuard module="school_fees" action="read">
      <ContentLayout title="School Fee Plan">
        <div className="space-y-4">
          <SchoolFeesBreadcrumb leaf="Fee plan" />

          <div>
            <h1 className="text-2xl font-bold py-1">Fee Plan</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Fee head × term grid for one class. A blank cell means the head is not charged that
              term.
            </p>
          </div>

          <PlanDetail id={id} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
