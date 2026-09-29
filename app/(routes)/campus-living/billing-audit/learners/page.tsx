'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { BarChart3 } from 'lucide-react';
import { FINDING_DESCRIPTIONS, type BillingAuditFinding } from '@/types/campus-living-billing-audit';
import { BillingAuditFilterBar } from '../_components/billing-audit-filter-bar';
import { useBillingAuditFilters } from '../_components/use-billing-audit-filters';
import { LearnersTable } from '../_components/learners-table';

export default function BillingAuditLearnersPage() {
  return (
    <PermissionGuard module='campus_living.billing_audit' action='view'>
      <ContentLayout title='Learner Audit'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/campus-living'>Campus Living</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/campus-living/billing-audit'>Billing Audit</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Learner Audit</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <h1 className='text-2xl font-bold py-1'>Hostel Learner Audit</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                One row per hostel learner: fee band and entitlement, the structure&apos;s
                expected fees, and the room / mess / upgrade bills actually raised — with
                status and due dates.
              </p>
            </div>
            <Button asChild variant='outline'>
              <Link href='/campus-living/billing-audit'>
                <BarChart3 className='mr-2 h-4 w-4' />
                Analytics
              </Link>
            </Button>
          </div>

          <Suspense
            fallback={
              <div className='space-y-4'>
                <Skeleton className='h-24 w-full' />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className='h-12 w-full' />
                ))}
              </div>
            }
          >
            <LearnersBody />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function LearnersBody() {
  const { canAccess, isSuperAdmin } = usePermissions();
  // The export key is granted separately from view — a role may read the
  // audit without being allowed to take learner data off-platform.
  const canExport = isSuperAdmin || canAccess('campus_living.billing_audit', 'export');
  const { filters, onChange } = useBillingAuditFilters();
  const finding = filters.finding ?? 'all';

  return (
    <div className='space-y-4'>
      <BillingAuditFilterBar filters={filters} onChange={onChange} variant='learners' />
      {finding !== 'all' && finding !== 'clean' && (
        <p className='text-xs text-muted-foreground'>
          Showing: {FINDING_DESCRIPTIONS[finding as BillingAuditFinding]}
        </p>
      )}
      <LearnersTable filters={filters} canExport={canExport} />
    </div>
  );
}
