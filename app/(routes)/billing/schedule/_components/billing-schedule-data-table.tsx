'use client';

import React from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { BillingScheduleSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Users, FileText, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import { StudentBill } from '@/types/billing-schedule';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';

interface BillingScheduleDataTableProps {
  search: BillingScheduleSearchParams;
}

export function BillingScheduleDataTable({
  search
}: BillingScheduleDataTableProps) {
  const router = useRouter();
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();

  // Wait for permissions and profile to be loaded before rendering the table
  const isReady = !permissionsLoading && !!userProfile;

  // Permission checks
  const canCreateBills =
    isSuperAdmin || canAccess('billing.schedule', 'create');
  const canDeleteBills =
    isSuperAdmin || canAccess('billing.schedule', 'delete');

  const fetchData = React.useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      from_date: string;
      to_date: string;
      sort_by: string;
      sort_order: string;
    }) => {
      try {
        // Map the DataTable parameters to our StudentBillService parameters
        const filters = {
          page: params.page,
          limit: params.limit,
          search: params.search || undefined,
          sortBy: params.sort_by || undefined,
          sortDirection: (params.sort_order as 'asc' | 'desc') || undefined,
          institution_id:
            search.institution_id ||
            (!isSuperAdmin && userProfile?.institution_id
              ? userProfile.institution_id
              : undefined),
          student_id: search.student_id || undefined,
          item_category_id: search.item_category_id || undefined,
          status: search.status || undefined,
          is_recurring:
            search.is_recurring === 'true'
              ? true
              : search.is_recurring === 'false'
              ? false
              : undefined,
          amount_from: search.amount_from || undefined,
          amount_to: search.amount_to || undefined,
          due_date_from:
            search.dueDateRange?.from?.toISOString().split('T')[0] || undefined,
          due_date_to:
            search.dueDateRange?.to?.toISOString().split('T')[0] || undefined,
          academic_year_id: search.academic_year_id || undefined,
          degree_id: search.degree_id || undefined,
          department_id: search.department_id || undefined,
          program_id: search.program_id || undefined,
          semester_id: search.semester_id || undefined,
          section_id: search.section_id || undefined
        };

        const { data, metadata } = await StudentBillService.getStudentBills(
          filters
        );

        return {
          success: true,
          data: data || [],
          pagination: {
            page: params.page,
            limit: params.limit,
            total_pages: metadata?.totalPages ?? 0,
            total_items: metadata?.total ?? 0
          }
        };
      } catch (error) {
        console.error('Error fetching student bills:', error);
        throw error;
      }
    },
    [
      search.institution_id,
      search.student_id,
      search.item_category_id,
      search.status,
      search.is_recurring,
      search.amount_from,
      search.amount_to,
      search.dueDateRange?.from,
      search.dueDateRange?.to,
      search.academic_year_id,
      search.degree_id,
      search.department_id,
      search.program_id,
      search.semester_id,
      search.section_id,
      isSuperAdmin,
      userProfile?.institution_id
    ]
  );

  const handleBulkDelete = React.useCallback(
    async (selectedRows: StudentBill[], resetSelection: () => void) => {
      if (selectedRows.length === 0) return;

      const confirmed = window.confirm(
        `Are you sure you want to delete ${selectedRows.length} bill${
          selectedRows.length > 1 ? 's' : ''
        }? This action cannot be undone.`
      );

      if (!confirmed) return;

      try {
        // Delete all selected bills
        await Promise.all(
          selectedRows.map((bill: StudentBill) =>
            StudentBillService.deleteStudentBill(bill.id)
          )
        );

        // Reset selection and refresh data
        resetSelection();
        // The DataTable will automatically refetch data after this
      } catch (error) {
        console.error('Error deleting bills:', error);
      }
    },
    []
  );

  const renderCustomToolbar = React.useCallback(
    (props: {
      selectedRows: any[];
      allSelectedIds: (string | number)[];
      totalSelectedCount: number;
      resetSelection: () => void;
    }) => (
      <div className='flex items-center gap-2'>
        {canCreateBills && (
          <>
            <Button
              onClick={() => router.push('/billing/schedule/new')}
              size='sm'
              className='h-8'
            >
              <Plus className='mr-2 h-4 w-4' />
              Create Bill
            </Button>
            <Button
              onClick={() => router.push('/billing/schedule/bulk-create')}
              variant='outline'
              size='sm'
              className='h-8'
            >
              <Users className='mr-2 h-4 w-4' />
              Bulk Create
            </Button>
          </>
        )}

        {canDeleteBills && props.selectedRows.length > 0 && (
          <Button
            onClick={() =>
              handleBulkDelete(
                props.selectedRows as StudentBill[],
                props.resetSelection
              )
            }
            variant='destructive'
            size='sm'
            className='h-8'
          >
            <TrashIcon className='mr-2 h-4 w-4' />
            Delete Selected ({props.selectedRows.length})
          </Button>
        )}
      </div>
    ),
    [canCreateBills, canDeleteBills, router, handleBulkDelete]
  );

  // Show loading state while waiting for permissions and profile
  if (!isReady) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-32' />
        </div>
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{
        entityName: 'student-bills',
        columnMapping: {
          student_name: 'Student',
          'institution.name': 'Institution',
          bill_description: 'Description',
          'item_category.item_category_name': 'Category',
          due_date: 'Due Date',
          final_amount: 'Amount',
          status: 'Status',
          is_recurring: 'Type',
          created_at: 'Created At'
        },
        columnWidths: [
          { wch: 20 },
          { wch: 25 },
          { wch: 30 },
          { wch: 20 },
          { wch: 15 },
          { wch: 15 },
          { wch: 10 },
          { wch: 10 },
          { wch: 15 }
        ],
        headers: [
          'Student',
          'Institution',
          'Description',
          'Category',
          'Due Date',
          'Amount',
          'Status',
          'Type',
          'Created At'
        ]
      }}
      idField='id'
      config={{
        enableUrlState: true,
        enableDateFilter: false,
        enableExport: true,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'billing-schedule-table'
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
