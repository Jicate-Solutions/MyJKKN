'use client';

// HR Academic Years — the leave/payroll calendar HR owns.
//
// Created 2026-08-10. HR previously borrowed academic_years, which is scoped per
// institution: '2026-2027' existed 11 times with 11 different ids, so the same
// logical year could not be compared across institutions (the balance analytics
// RPC had to match on the trimmed NAME), and its Jun 1 -> Mar 31 span left April
// and May outside every year. These rows are group-wide and run Jun 1 -> May 31,
// a full 12 months, so no day falls outside an HR year.

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { HRAcademicYearTable } from './_components/hr-academic-year-table';

export default function HRAcademicYearsPage() {
  return (
    <PermissionGuard module="hr.academic_years" action="manage">
      <ContentLayout title="HR Academic Years">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/admin">Admin</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>HR Academic Years</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="mt-4">
          <CardContent className="p-6">
            <HRAcademicYearTable />
          </CardContent>
        </Card>
      </ContentLayout>
    </PermissionGuard>
  );
}
