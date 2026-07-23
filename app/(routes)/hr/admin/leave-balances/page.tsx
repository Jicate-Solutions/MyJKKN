'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { LeaveBalanceAnalytics } from './_components/leave-balance-analytics';
import { GenerateBalancesForm } from './_components/generate-balances-form';

/**
 * Guarded on hr.leave.balance.MANAGE — deliberately not `.view`, which is a
 * self-service key granted to 69 roles (Student, Guest, Parent, Driver …).
 * The analytics RPC re-checks the same key server-side.
 */
export default function LeaveBalancesPage() {
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

        <Tabs defaultValue="analytics" className="mt-4">
          <TabsList>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-4">
            <LeaveBalanceAnalytics />
          </TabsContent>

          <TabsContent value="generate" className="mt-4">
            <GenerateBalancesForm />
          </TabsContent>
        </Tabs>
      </ContentLayout>
    </PermissionGuard>
  );
}
