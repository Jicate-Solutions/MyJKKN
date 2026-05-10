'use client';

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
import { Settings2, Filter, Receipt } from 'lucide-react';
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
  const { isSuperAdmin } = usePermissions();

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

  // Handle filter changes by updating URL
  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      // Reset page to 1 when filters change
      params.set('page', '1');

      router.push(`/billing/schedule?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Handle clearing all filters
  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    // Keep only page and pageSize
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
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-2xl font-bold py-1'>Billing Schedule Management</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Manage student bills, track payments, and schedule recurring billing
              </p>
            </div>

            <div className='flex items-center gap-2'>
              {/* Super-admin only: bulk receipt generation from current filters */}
              {isSuperAdmin && (
                <Button
                  variant='default'
                  size='sm'
                  onClick={() => setBulkReceiptOpen(true)}
                  className='bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2'
                  title='Generate receipts in bulk for the currently filtered bills (super admin only)'
                >
                  <Receipt className='h-4 w-4' />
                  Bulk Generate Receipts
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
                    onClearFilters={handleClearFilters}
                  />
                ) : (
                  <BillingScheduleFilters
                    searchParams={search}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                  />
                )}

                {/* Data Table */}
                <BillingScheduleDataTable search={search} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bulk Receipt Dialog — super admin only, gated above */}
        {isSuperAdmin && (
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