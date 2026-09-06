'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings2, Filter, ReceiptIndianRupee, Pencil } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { BillingScheduleDataTable } from './_components/billing-schedule-data-table';
import { billingScheduleSearchParamsSchema } from './_components/data-table-schema';
import { BillingScheduleFilters } from './_components/billing-schedule-filters';
import { AdvancedBillingScheduleFilters } from './_components/advanced-billing-schedule-filters';
import { BulkReceiptDialog } from './_components/bulk-receipt-dialog';

export default function BillingSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [useAdvancedFilters, setUseAdvancedFilters] = useState(false);
  const [bulkReceiptOpen, setBulkReceiptOpen] = useState(false);
  const { can } = usePermissions();

  // Bulk receipt generation is delegable through Role Management rather than
  // reserved for super admins. `can()` already returns true for super admins,
  // so this single check covers both. The API routes behind the dialog
  // re-check the same key and additionally bound the batch to the caller's
  // accessible institutions — see lib/auth/bulk-receipt-access.ts.
  const canBulkGenerateReceipts = can('billing.receipts.bulk_create');

  // Parse current search parameters
  const search = billingScheduleSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

  // Compose the filter map the bulk-receipt template route understands.
  // We pass through the schedule-page filters 1:1 so what the admin sees on
  // screen is exactly what the template will be pre-filled with.
  const bulkReceiptFilters: Record<string, string | undefined> = {
    institution_id: search.institution_id,
    item_category_id: search.item_category_id,
    degree_id: search.degree_id,
    department_id: search.department_id,
    program_id: search.program_id,
    semester_id: search.semester_id,
    section_id: search.section_id,
    academic_year_id: search.academic_year_id,
    due_date_from: search.dueDateRange?.from?.toISOString().slice(0, 10),
    due_date_to: search.dueDateRange?.to?.toISOString().slice(0, 10)
  };

  // Handle a single filter change by updating URL
  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      params.set('page', '1');
      router.push(`/billing/schedule?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Handle multiple filter changes in a single URL push to avoid race conditions
  const handleBatchFilterChange = useCallback(
    (changes: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams);

      for (const [key, value] of Object.entries(changes)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }

      params.set('page', '1');
      router.push(`/billing/schedule?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Handle clearing all filters
  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    if (searchParams.get('pageSize')) {
      params.set('pageSize', searchParams.get('pageSize')!);
    }
    router.push(`/billing/schedule?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <PermissionGuard module='billing.schedule' action='view'>
      <ContentLayout title='Billing Schedule'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/billing'>Billing</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Schedule</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header Section */}
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0'>
              <h1 className='text-2xl font-bold py-1'>Billing Schedule Management</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Manage student bills, track payments, and schedule recurring billing
              </p>
            </div>

            <div className='flex flex-wrap items-center gap-2 shrink-0'>
              {/* Bulk receipt generation from current filters */}
              {canBulkGenerateReceipts && (
                <Button
                  variant='default'
                  size='sm'
                  onClick={() => setBulkReceiptOpen(true)}
                  className='bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2'
                  title='Generate receipts in bulk for the currently filtered bills'
                >
                  <ReceiptIndianRupee className='h-4 w-4' />
                  Bulk Generate Receipts
                </Button>
              )}
              {can('billing.schedule.update') && (
                <Button asChild variant='outline' size='sm' className='flex items-center gap-2'>
                  <Link href='/billing/schedule/bulk-edit'>
                    <Pencil className='h-4 w-4' />
                    Bulk Edit
                  </Link>
                </Button>
              )}
              <Button
                variant={useAdvancedFilters ? "default" : "outline"}
                size="sm"
                onClick={() => setUseAdvancedFilters(!useAdvancedFilters)}
                className="flex items-center gap-2"
              >
                {useAdvancedFilters ? (
                  <>
                    <Settings2 className="h-4 w-4" />
                    Advanced Filters
                  </>
                ) : (
                  <>
                    <Filter className="h-4 w-4" />
                    Basic Filters
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                {/* Filters */}
                {useAdvancedFilters ? (
                  <AdvancedBillingScheduleFilters
                    searchParams={search}
                    onFilterChange={handleFilterChange}
                    onBatchFilterChange={handleBatchFilterChange}
                    onClearFilters={handleClearFilters}
                  />
                ) : (
                  <BillingScheduleFilters
                    searchParams={search}
                    onFilterChange={handleFilterChange}
                    onBatchFilterChange={handleBatchFilterChange}
                    onClearFilters={handleClearFilters}
                  />
                )}

                {/* Data Table */}
                <BillingScheduleDataTable search={search} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bulk Receipt Dialog — gated on the same permission as the button */}
        {canBulkGenerateReceipts && (
          <BulkReceiptDialog
            open={bulkReceiptOpen}
            onOpenChange={setBulkReceiptOpen}
            scheduleFilters={bulkReceiptFilters}
          />
        )}
      </ContentLayout>
    </PermissionGuard>
  );
}