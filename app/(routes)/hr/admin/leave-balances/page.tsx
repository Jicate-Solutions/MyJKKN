'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { AcademicYearBar } from './_components/academic-year-bar';
import { LeaveBalanceAnalytics } from './_components/leave-balance-analytics';
import { GenerateBalancesForm } from './_components/generate-balances-form';
import { StaffBalancesTab } from './_components/staff-balances-tab';

/**
 * Guarded on hr.leave.balance.MANAGE — deliberately not `.view`, which is a
 * self-service key granted to 69 roles (Student, Guest, Parent, Driver …).
 * Both the analytics and the generator RPCs re-check the same key server-side.
 *
 * The year is held here rather than inside either tab. Both read it: Analytics
 * reports coverage for that year, Generate provisions into it. When each tab
 * owned its own copy you could read one year's gaps and act on another's.
 */
export default function LeaveBalancesPage() {
  // Null = "the year containing today", resolved server-side by the RPC.
  const [year, setYear] = useState<string | null>(null);

  return (
    <PermissionGuard module="hr.leave.balance" action="manage">
      <ContentLayout title="Leave Balances">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/admin">Admin</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Leave Balances</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-4">
          <AcademicYearBar value={year} onChange={setYear} />
        </div>

        <Tabs defaultValue="analytics" className="mt-4">
          <TabsList>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="staff">Staff Balances</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-4">
            <LeaveBalanceAnalytics year={year} />
          </TabsContent>

          <TabsContent value="generate" className="mt-4">
            <GenerateBalancesForm year={year} />
          </TabsContent>

          {/* Reads the same page-level year as the other two, so drilling into
              a person never shows a different year than the coverage you just
              acted on. */}
          <TabsContent value="staff" className="mt-4">
            <StaffBalancesTab year={year} />
          </TabsContent>
        </Tabs>
      </ContentLayout>
    </PermissionGuard>
  );
}
