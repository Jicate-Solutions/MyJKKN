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

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';

import { SchoolFeesBreadcrumb } from './_components/school-fees-breadcrumb';
import { SchoolFeePlansView } from './_components/school-fee-plans-view';

export default function SchoolFeePlansPage() {
  return (
    <PermissionGuard module="school_fees" action="read">
      <ContentLayout title="School Fee Plans">
        <div className="space-y-4">
          <SchoolFeesBreadcrumb />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold py-1">School Fee Plans</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                One fee plan per class per academic year, split across terms. Unlike college fee
                structures, these are re-fixed every year rather than locked to the admission year.
              </p>
            </div>

            <Button asChild variant="outline" size="sm">
              <Link href="/billing/school-fees/term-calendar">
                <CalendarDays className="h-4 w-4 mr-1" />
                Term calendar
              </Link>
            </Button>
          </div>

          <SchoolFeePlansView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
