'use client';

// app/(routes)/billing/school-fees/collect/page.tsx
//
// The School Bill Payment counter.
//
// Guarded on school_fees.collect rather than .read: everything on this screen
// leads to writing a receipt and moving money, so a read-only finance reviewer
// has no reason to be here at all. Same reasoning as the generate screen.

import { cn } from '@/lib/utils';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { SchoolFeesBreadcrumb } from '../_components/school-fees-breadcrumb';
import { SchoolFeeSectionHeader } from '../_components/school-fee-section-header';
import { SECTION_THEMES } from '../_components/section-theme';
import { CollectView } from './_components/collect-view';

export default function SchoolFeeCollectPage() {
  return (
    <PermissionGuard module="school_fees" action="collect">
      <ContentLayout title="School Bill Payment">
        <div className={cn('space-y-4 rounded-2xl p-3 sm:p-4', SECTION_THEMES.collect.pageBg)}>
          <SchoolFeesBreadcrumb leaf="Collect Payment" />

          <SchoolFeeSectionHeader
            section="collect"
            title="School Bill Payment"
            description="Search or scan a learner, select their outstanding term bills, and record the payment. Issues an A4 receipt carrying a student copy and an institution copy."
          />

          <CollectView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
