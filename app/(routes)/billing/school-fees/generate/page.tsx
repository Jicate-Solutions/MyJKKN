'use client';

// app/(routes)/billing/school-fees/generate/page.tsx
//
// Phase 7 — yearly fee generation.
// Design: docs/plans/2026-08-13-school-fee-structure-design.md §5.2
//
// Guarded on school_fees.generate rather than .read: everything on this screen
// leads to writing financial records, so read-only users have no reason to be
// here at all.

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { SchoolFeesBreadcrumb } from '../_components/school-fees-breadcrumb';
import { GenerateView } from './_components/generate-view';

export default function SchoolFeeGeneratePage() {
  return (
    <PermissionGuard module="school_fees" action="generate">
      <ContentLayout title="Generate School Fees">
        <div className="space-y-4">
          <SchoolFeesBreadcrumb leaf="Generate" />

          <div>
            <h1 className="text-2xl font-bold py-1">Generate Year Fee</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Raises one bill per learner, per term, per fee head from each class&apos;s active
              plan. Re-running skips learners who already have bills, so it is safe to retry.
            </p>
          </div>

          <GenerateView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
