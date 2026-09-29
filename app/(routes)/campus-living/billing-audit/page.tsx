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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AlertTriangle, ListChecks } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';
import { useBillingAuditSummary } from '@/hooks/campus-living/use-billing-audit';
import { BillingAuditFilterBar } from './_components/billing-audit-filter-bar';
import { useBillingAuditFilters } from './_components/use-billing-audit-filters';
import { KpiCards } from './_components/kpi-cards';
import {
  BillClassChart,
  BillStatusDonut,
  ByInstitutionChart,
  FindingsBreakdown,
  OverdueAgingChart
} from './_components/charts';
import { BlockTable, InstitutionTable, RoomCategoryTable } from './_components/breakdown-tables';

export default function BillingAuditAnalyticsPage() {
  return (
    <PermissionGuard module='campus_living.billing_audit' action='view'>
      <ContentLayout title='Billing Audit'>
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
                <BreadcrumbPage>Billing Audit</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <h1 className='text-2xl font-bold py-1'>Hostel Billing Audit</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Every hostel learner&apos;s fee band, configured fees, and what was actually
                billed, paid and is due — for the target academic year.
              </p>
            </div>
            <Button asChild variant='outline'>
              <Link href='/campus-living/billing-audit/learners'>
                <ListChecks className='mr-2 h-4 w-4' />
                Learner Audit
              </Link>
            </Button>
          </div>

          <Suspense
            fallback={
              <div className='space-y-4'>
                <Skeleton className='h-24 w-full' />
                <Skeleton className='h-40 w-full' />
              </div>
            }
          >
            <AnalyticsBody />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function AnalyticsBody() {
  // useSearchParams lives inside the Suspense boundary above.
  const { filters, onChange, scopeQuery } = useBillingAuditFilters();
  const summaryQuery = useBillingAuditSummary(filters);
  const summary = summaryQuery.data;
  const isLoading = summaryQuery.isLoading;
  const selectedInstitutionId = filters.institution_ids?.[0];

  return (
    <div className='space-y-6'>
      <BillingAuditFilterBar filters={filters} onChange={onChange} variant='analytics' />

      {summaryQuery.error && (
        // A statement timeout or a permission error must read as a failure —
        // zeros on an audit screen would read as "nothing wrong".
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>Could not load the audit</AlertTitle>
          <AlertDescription>{getErrorMessage(summaryQuery.error)}</AlertDescription>
        </Alert>
      )}

      {summary && summary.target_years.length > 0 && (
        <p className='text-xs text-muted-foreground'>
          Measured for:{' '}
          {summary.target_years
            .map((t) => `${(t.institution ?? '').replace(/^JKKN /, '')} ${t.academic_year_name ?? ''}`.trim())
            .join(' · ')}
        </p>
      )}

      <KpiCards kpis={summary?.kpis} isLoading={isLoading} learnersQuery={scopeQuery} />

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <FindingsBreakdown data={summary?.by_finding} isLoading={isLoading} learnersQuery={scopeQuery} />
        <ByInstitutionChart data={summary?.by_institution} isLoading={isLoading} />
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        <BillStatusDonut data={summary?.by_bill_status} isLoading={isLoading} />
        <BillClassChart data={summary?.by_bill_class} isLoading={isLoading} />
        <OverdueAgingChart
          aging={summary?.overdue_aging}
          dueSoon={summary?.due_soon}
          isLoading={isLoading}
        />
      </div>

      <InstitutionTable data={summary?.by_institution} isLoading={isLoading} learnersQuery={scopeQuery} />

      <div className='grid grid-cols-1 gap-6 xl:grid-cols-2'>
        <RoomCategoryTable data={summary?.by_room_category} isLoading={isLoading} />
        <BlockTable
          data={summary?.by_block}
          isLoading={isLoading}
          institutionId={selectedInstitutionId}
          learnersQuery={scopeQuery}
        />
      </div>
    </div>
  );
}
