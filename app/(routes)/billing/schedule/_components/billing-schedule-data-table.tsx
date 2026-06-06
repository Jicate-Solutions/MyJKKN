'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { BillingScheduleSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Users, Ban, FileText, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import { StudentBill } from '@/types/billing-schedule';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteConfirmationModal } from '@/components/billing/delete-confirmation-modal';
import { CancelConfirmationModal } from '@/components/billing/cancel-confirmation-modal';

interface BillingScheduleDataTableProps {
  search: BillingScheduleSearchParams;
}

const CANCELLABLE_STATUSES = ['unpaid', 'partially_paid', 'overdue'];

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

  const isReady = !permissionsLoading && !!userProfile;

  const canCreateBills =
    isSuperAdmin || canAccess('billing.schedule', 'create');
  const canCancelBills =
    isSuperAdmin || canAccess('billing.schedule', 'update');

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
        const filters = {
          page: params.page,
          limit: params.limit,
          search: params.search || undefined,
          sortBy: params.sort_by || undefined,
          sortDirection: (params.sort_order as 'asc' | 'desc') || undefined,
          institution_id: search.institution_id || undefined,
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
          section_id: search.section_id || undefined,
          accommodation_type: search.accommodation_type || undefined
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
      search.accommodation_type,
    ]
  );

  // ── Delete modal state ───────────────────────────────────────────
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    selectedBills: StudentBill[];
    resetSelection?: () => void;
    isLoading: boolean;
  }>({
    isOpen: false,
    selectedBills: [],
    resetSelection: undefined,
    isLoading: false
  });

  const handleBulkDelete = React.useCallback(
    (selectedRows: StudentBill[], resetSelection: () => void) => {
      if (selectedRows.length === 0) return;
      setDeleteModal({
        isOpen: true,
        selectedBills: selectedRows,
        resetSelection,
        isLoading: false
      });
    },
    []
  );

  const handleConfirmDelete = React.useCallback(async () => {
    const { selectedBills, resetSelection } = deleteModal;
    if (selectedBills.length === 0) return;

    setDeleteModal((prev) => ({ ...prev, isLoading: true }));

    try {
      const loadingToast = toast.loading(
        `Deleting ${selectedBills.length} bill${selectedBills.length > 1 ? 's' : ''}...`
      );

      const result = await StudentBillService.bulkDeleteStudentBills(
        selectedBills.map((b) => b.id)
      );

      if (result.failed.length > 0) {
        toast.error(
          `Failed to delete ${result.failed.length} bill(s).`,
          { id: loadingToast }
        );
      } else {
        toast.success(
          `Successfully deleted ${result.success.length} bill${result.success.length > 1 ? 's' : ''}!`,
          { id: loadingToast }
        );
      }

      resetSelection?.();
      setDeleteModal({
        isOpen: false,
        selectedBills: [],
        resetSelection: undefined,
        isLoading: false
      });
    } catch (error) {
      console.error('Error deleting bills:', error);
      toast.error(
        `Failed to delete bills. Please try again.`
      );
      setDeleteModal((prev) => ({ ...prev, isLoading: false }));
    }
  }, [deleteModal]);

  const handleCloseDeleteModal = React.useCallback(() => {
    if (!deleteModal.isLoading) {
      setDeleteModal({
        isOpen: false,
        selectedBills: [],
        resetSelection: undefined,
        isLoading: false
      });
    }
  }, [deleteModal.isLoading]);

  // ── Cancel modal state ───────────────────────────────────────────
  const [cancelModal, setCancelModal] = React.useState<{
    isOpen: boolean;
    selectedBills: StudentBill[];
    resetSelection?: () => void;
    isLoading: boolean;
  }>({
    isOpen: false,
    selectedBills: [],
    resetSelection: undefined,
    isLoading: false
  });

  const handleBulkCancel = React.useCallback(
    (selectedRows: StudentBill[], resetSelection: () => void) => {
      if (selectedRows.length === 0) return;
      setCancelModal({
        isOpen: true,
        selectedBills: selectedRows,
        resetSelection,
        isLoading: false
      });
    },
    []
  );

  const handleConfirmCancel = React.useCallback(
    async (reason?: string) => {
      const { selectedBills, resetSelection } = cancelModal;
      if (selectedBills.length === 0) return;

      const cancellable = selectedBills.filter((b) =>
        CANCELLABLE_STATUSES.includes(b.status)
      );

      if (cancellable.length === 0) {
        toast.error('None of the selected bills can be cancelled.');
        return;
      }

      setCancelModal((prev) => ({ ...prev, isLoading: true }));

      try {
        const loadingToast = toast.loading(
          `Cancelling ${cancellable.length} bill${cancellable.length > 1 ? 's' : ''}...`
        );

        const result = await StudentBillService.bulkCancelStudentBills(
          cancellable.map((b) => b.id),
          reason
        );

        const skipped = selectedBills.length - cancellable.length;
        const parts: string[] = [];
        if (result.success.length > 0) {
          parts.push(`${result.success.length} cancelled`);
        }
        if (result.failed.length > 0) {
          parts.push(`${result.failed.length} failed`);
        }
        if (skipped > 0) {
          parts.push(`${skipped} skipped (ineligible status)`);
        }

        if (result.failed.length > 0) {
          toast.error(parts.join(', '), { id: loadingToast });
        } else {
          toast.success(parts.join(', '), { id: loadingToast });
        }

        resetSelection?.();
        setCancelModal({
          isOpen: false,
          selectedBills: [],
          resetSelection: undefined,
          isLoading: false
        });
      } catch (error) {
        console.error('Error cancelling bills:', error);
        toast.error('Failed to cancel bills. Please try again.');
        setCancelModal((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [cancelModal]
  );

  const handleCloseCancelModal = React.useCallback(() => {
    if (!cancelModal.isLoading) {
      setCancelModal({
        isOpen: false,
        selectedBills: [],
        resetSelection: undefined,
        isLoading: false
      });
    }
  }, [cancelModal.isLoading]);

  // ── Toolbar ──────────────────────────────────────────────────────
  const renderCustomToolbar = React.useCallback(
    (props: {
      selectedRows: any[];
      allSelectedIds: (string | number)[];
      totalSelectedCount: number;
      resetSelection: () => void;
    }) => {
      const selected = props.selectedRows as StudentBill[];
      const cancellableCount = selected.filter((b) =>
        CANCELLABLE_STATUSES.includes(b.status)
      ).length;

      return (
        <div className='flex items-center gap-2'>
          {canCreateBills && (
            <Button
              onClick={() => router.push('/billing/schedule/bulk-create')}
              variant='outline'
              size='sm'
              className='h-8'
            >
              <Users className='mr-2 h-4 w-4' />
              Bulk Create
            </Button>
          )}

          {canCancelBills && selected.length > 0 && (
            <Button
              onClick={() =>
                handleBulkCancel(selected, props.resetSelection)
              }
              variant='outline'
              size='sm'
              className='h-8 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800'
              title={
                cancellableCount < selected.length
                  ? `${selected.length - cancellableCount} bill(s) have ineligible status and will be skipped`
                  : undefined
              }
            >
              <Ban className='mr-2 h-4 w-4' />
              Cancel Selected ({cancellableCount}/{selected.length})
            </Button>
          )}

          {isSuperAdmin && selected.length > 0 && (
            <Button
              onClick={() =>
                handleBulkDelete(selected, props.resetSelection)
              }
              variant='destructive'
              size='sm'
              className='h-8'
            >
              <TrashIcon className='mr-2 h-4 w-4' />
              Delete Selected ({selected.length})
            </Button>
          )}
        </div>
      );
    },
    [canCreateBills, canCancelBills, isSuperAdmin, router, handleBulkDelete, handleBulkCancel]
  );

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
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'student-bills',
          columnMapping: {
            student_name: 'Student',
            'institution.name': 'Institution',
            department_semester: 'Department / Semester',
            'item_category.category_name': 'Category',
            due_date: 'Due Date',
            final_amount: 'Amount',
            status: 'Status',
            is_recurring: 'Type',
            created_at: 'Created At'
          },
          columnWidths: [
            { wch: 20 },
            { wch: 25 },
            { wch: 25 },
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
            'Department / Semester',
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

      {/* Delete Confirmation Modal — super admin only */}
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        title={`Delete ${deleteModal.selectedBills.length} Bill${
          deleteModal.selectedBills.length > 1 ? 's' : ''
        }?`}
        description={`You are about to permanently delete ${
          deleteModal.selectedBills.length
        } student bill${
          deleteModal.selectedBills.length > 1 ? 's' : ''
        }. All related data including payments, discounts, receipts, and refunds will also be removed.`}
        items={deleteModal.selectedBills.map((bill) => ({
          id: bill.id,
          title: `${bill.student?.first_name || ''} ${bill.student?.last_name || ''} - ${bill.bill_description}`,
          subtitle: `Bill ID: ${bill.id.slice(-8)} | Due: ${new Date(
            bill.due_date
          ).toLocaleDateString()}`,
          amount: bill.final_amount,
          status: bill.status,
          type: 'bill' as const
        }))}
        itemType={deleteModal.selectedBills.length > 1 ? 'bills' : 'bill'}
        isLoading={deleteModal.isLoading}
        showCascadeWarning
        warningMessage='This will permanently remove all payment history, discounts, and related financial records.'
      />

      {/* Cancel Confirmation Modal */}
      <CancelConfirmationModal
        isOpen={cancelModal.isOpen}
        onClose={handleCloseCancelModal}
        onConfirm={handleConfirmCancel}
        bills={cancelModal.selectedBills}
        isLoading={cancelModal.isLoading}
      />
    </>
  );
}
