'use client';

// app/(routes)/billing/school-fees/page.tsx
//
// Phase 4 — the class fee-plan grid.
// Design: docs/plans/2026-08-13-school-fee-structure-design.md §6
//
// Also the landing page for the /school-fees folder, which check:sidebar
// flagged as missing during Phase 3.

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';

import { SchoolFeesBreadcrumb } from './_components/school-fees-breadcrumb';
import { SchoolFeeSectionHeader } from './_components/school-fee-section-header';
import { SECTION_THEMES } from './_components/section-theme';
import { SchoolFeePlansView } from './_components/school-fee-plans-view';

export default function SchoolFeePlansPage() {
  return (
    <PermissionGuard module="school_fees" action="read">
      <ContentLayout title="School Fee Plans">
        <div className={cn('space-y-4 rounded-2xl p-3 sm:p-4', SECTION_THEMES.plans.pageBg)}>
          <SchoolFeesBreadcrumb />

          <SchoolFeeSectionHeader
            section="plans"
            title="School Fee Plans"
            description="Configure and manage fee structures for each academic year, class and term. Unlike college fee structures, these are re-fixed every year."
            actions={
              <Button asChild variant="secondary" size="sm">
                <Link href="/billing/school-fees/term-calendar">
                  <CalendarDays className="h-4 w-4 mr-1" />
                  Term calendar
                </Link>
              </Button>
            }
          />

          <SchoolFeePlansView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
