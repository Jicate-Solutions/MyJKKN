'use client';

// app/(routes)/billing/school-fees/collect/page.tsx
//
// The School Bill Payment counter.
//
// Guarded on school_fees.collect rather than .read: everything on this screen
// leads to writing a receipt and moving money, so a read-only finance reviewer
// has no reason to be here at all. Same reasoning as the generate screen.

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { SchoolFeesBreadcrumb } from '../_components/school-fees-breadcrumb';
import { CollectView } from './_components/collect-view';

export default function SchoolFeeCollectPage() {
  return (
    <PermissionGuard module="school_fees" action="collect">
      <ContentLayout title="School Bill Payment">
        <div className="space-y-4">
          <SchoolFeesBreadcrumb leaf="Collect Payment" />

          <div>
            <h1 className="text-2xl font-bold py-1">School Bill Payment</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Search or scan a learner, select their outstanding term bills, and record the
              payment. Issues an A4 receipt carrying a student copy and an institution copy.
            </p>
          </div>

          <CollectView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
