'use client';

// app/(routes)/billing/school-fees/term-calendar/page.tsx
//
// Phase 3 of the school fee module.
// Design: docs/plans/2026-08-13-school-fee-structure-design.md §6
//
// Deliberately the FIRST screen built. Generation stamps due_date and
// fine_effective_date onto every billing_student_bills row it creates, so a
// year without a calendar produces real financial records that can never be
// chased or fined.

import { cn } from '@/lib/utils';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { SchoolFeesBreadcrumb } from '../_components/school-fees-breadcrumb';
import { SchoolFeeSectionHeader } from '../_components/school-fee-section-header';
import { SECTION_THEMES } from '../_components/section-theme';
import { TermCalendarView } from './_components/term-calendar-view';

export default function SchoolTermCalendarPage() {
  return (
    <PermissionGuard module="school_fees" action="read">
      <ContentLayout title="School Term Calendar">
        <div className={cn('space-y-4 rounded-2xl p-3 sm:p-4', SECTION_THEMES.calendar.pageBg)}>
          <SchoolFeesBreadcrumb leaf="Term Calendar" />

          <SchoolFeeSectionHeader
            section="calendar"
            title="School Term Calendar"
            description="Term due dates, fine start dates and flat fine amounts — set once per school per academic year, and inherited by every class fee plan in that year."
          />

          <TermCalendarView />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
