'use client';

// app/(routes)/billing/school-fees/generate/page.tsx
//
// Phase 7 — yearly fee generation.
// Design: docs/plans/2026-08-13-school-fee-structure-design.md §5.2
//
// Guarded on school_fees.generate rather than .read: everything on this screen
// leads to writing financial records, so read-only users have no reason to be
// here at all.

import { cn } from '@/lib/utils';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { SchoolFeesBreadcrumb } from '../_components/school-fees-breadcrumb';
import { SchoolFeeSectionHeader } from '../_components/school-fee-section-header';
import { SECTION_THEMES } from '../_components/section-theme';
import { GenerateView } from './_components/generate-view';

export default function SchoolFeeGeneratePage() {
  return (
    <PermissionGuard module="school_fees" action="generate">
      <ContentLayout title="Generate School Fees">
        <div className={cn('space-y-4 rounded-2xl p-3 sm:p-4', SECTION_THEMES.generate.pageBg)}>
          <SchoolFeesBreadcrumb leaf="Generate" />

          <SchoolFeeSectionHeader
            section="generate"
            title="Generate School Fees"
            description="Raises one bill per learner, per term, per fee head from each class's active plan. Re-running skips learners who already have bills, so it is safe to retry."
          />

          <GenerateView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
