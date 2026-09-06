'use client';

// app/(routes)/billing/school-fees/concessions/page.tsx
//
// Phase 6 — concession schemes and per-learner, per-year assignment.
// Design: docs/plans/2026-08-13-school-fee-structure-design.md §4.4
//
// Gated on school_fees.read to view; every mutation additionally needs
// school_fees.concession, which is checked inside the view.

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { SchoolFeesBreadcrumb } from '../_components/school-fees-breadcrumb';
import { ConcessionsView } from './_components/concessions-view';

export default function SchoolFeeConcessionsPage() {
  return (
    <PermissionGuard module="school_fees" action="read">
      <ContentLayout title="School Fee Concessions">
        <div className="space-y-4">
          <SchoolFeesBreadcrumb leaf="Concessions" />

          <div>
            <h1 className="text-2xl font-bold py-1">Fee Concessions</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Named schemes — Staff Ward, Sibling, RTE, Merit — assigned to learners for a single
              academic year. Percentages are summed and capped at 100%; flat amounts are then spread
              across the head&apos;s terms.
            </p>
          </div>

          <ConcessionsView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
