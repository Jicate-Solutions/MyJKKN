'use client';

// app/(routes)/admission/settings/school-fees/term-calendar/page.tsx
//
// Phase 3 of the school fee module.
// Design: docs/plans/2026-08-13-school-fee-structure-design.md §6
//
// Deliberately the FIRST screen built. Generation stamps due_date and
// fine_effective_date onto every billing_student_bills row it creates, so a
// year without a calendar produces real financial records that can never be
// chased or fined.

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { TermCalendarView } from './_components/term-calendar-view';

export default function SchoolTermCalendarPage() {
  return (
    <PermissionGuard module="school_fees" action="read">
      <ContentLayout title="School Term Calendar">
        <div className="space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/">Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admission/dashboard">Admission</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admission/settings">Settings</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>School Term Calendar</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl font-bold py-1">School Term Calendar</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Term due dates, fine start dates and flat fine amounts — set once per school per
              academic year, and inherited by every class fee plan in that year.
            </p>
          </div>

          <TermCalendarView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
