'use client';

// app/(routes)/billing/school-fees/concessions/page.tsx
//
// Phase 6 — concession schemes and per-learner, per-year assignment.
// Design: docs/plans/2026-08-13-school-fee-structure-design.md §4.4
//
// Gated on school_fees.read to view; every mutation additionally needs
// school_fees.concession, which is checked inside the view.

import { cn } from '@/lib/utils';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { SchoolFeesBreadcrumb } from '../_components/school-fees-breadcrumb';
import { SchoolFeeSectionHeader } from '../_components/school-fee-section-header';
import { SECTION_THEMES } from '../_components/section-theme';
import { ConcessionsView } from './_components/concessions-view';

export default function SchoolFeeConcessionsPage() {
  return (
    <PermissionGuard module="school_fees" action="read">
      <ContentLayout title="School Fee Concessions">
        <div className={cn('space-y-4 rounded-2xl p-3 sm:p-4', SECTION_THEMES.concessions.pageBg)}>
          <SchoolFeesBreadcrumb leaf="Concessions" />

          <SchoolFeeSectionHeader
            section="concessions"
            title="School Fee Concessions"
            description="Named schemes — Staff Ward, Sibling, RTE, Merit — assigned to learners for a single academic year. Percentages are summed and capped at 100%; flat amounts are spread across the head's terms."
          />

          <ConcessionsView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
