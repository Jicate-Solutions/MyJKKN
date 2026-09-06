'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { BillingScheduleSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Users, Ban, FileText, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import { StudentBill } from '@/types/billing-schedule';
import { getStatusLabel } from '@/components/learners/lifecycle-status-badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteConfirmationModal } from '@/components/billing/delete-confirmation-modal';
import { BillCancelDialog } from '@/components/billing/bill-cancel-dialog';
import type {
  BillCancelReasonCode,
  BillCancellationAttachment
} from '@/types/billing-bill-cancellation';

interface BillingScheduleDataTableProps {
  search: BillingScheduleSearchParams;
}

const CANCELLABLE_STATUSES = ['unpaid', 'partially_paid', 'overdue'];

// Upper bound on rows pulled by "Select all across pages". Generous for the
// billing list's scale; if a filtered set somehow exceeds it, only the first
// SELECT_ALL_CAP are selected (the banner count reflects the real selection).
const SELECT_ALL_CAP = 5000;

// ── Export shaping ───────────────────────────────────────────────────────
// The shared DataTable export resolves each cell via a FLAT key lookup
// (transformedItem[key]); it does NOT walk nested relations. A StudentBill
// keeps its data under bill.student.*, bill.institution.*, etc., so without a
// transformFunction every row serialises to {} (an empty export file). This
// flattener maps each bill into the flat, human-labelled keys the export
// columns read — including the learner's lifecycle status.
const PAYMENT_STATUS_EXPORT_LABELS: Record<string, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  superseded: 'Superseded'
};

function formatBillDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'dd MMM yyyy');
}

function transformBillForExport(
  bill: StudentBill
): Record<string, string | number> {
  const name = `${bill.student?.first_name || ''} ${
    bill.student?.last_name || ''
  }`.trim();
  const lifecycle = bill.student?.lifecycle_status;
  return {
    studentName: name || '—',
    institutionName: bill.institution?.name || '',
    departmentSemester: [
      bill.student?.department?.department_name,
      bill.student?.semester?.semester_name
    ]
      .filter(Boolean)
      .join(' / '),
    category: bill.item_category?.category_name || '',
    dueDate: formatBillDate(bill.due_date),
    amount: bill.final_amount ?? 0,
    paymentStatus:
      PAYMENT_STATUS_EXPORT_LABELS[bill.status] || bill.status || '',
    learnerStatus: lifecycle
      ? getStatusLabel(lifecycle as LifecycleStatus)
      : '',
    billType: bill.is_recurring ? 'Recurring' : 'One-time',
    createdAt: formatBillDate(bill.created_at)
  };
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

  const isReady = !permissionsLoading && !!userProfile;

  // Bulk create needs BOTH keys: bulk_create opens the flow, create is what the
  // RLS INSERT policy on billing_student_bills actually checks. Requiring only
  // bulk_create would show the button and fail every insert with an RLS denial.
  const canCreateBills =
    isSuperAdmin ||
    (canAccess('billing.schedule', 'create') &&
      canAccess('billing.schedule', 'bulk_create'));
  // Its own key, not billing.schedule.update: cancelling writes off money.
  const canCancelBills =
    isSuperAdmin || canAccess('billing.schedule', 'cancel');

  // Dimension filters shared by the paged fetch AND the cross-page "select all"
  // fetch, so both honour the exact same URL filters. Search/sort come per-call
  // from the table; everything else is the user's current filter selection.
  const dimensionFilters = React.useMemo(
    () => ({
      institution_id: search.institution_id || undefined,
      student_id: search.student_id || undefined,
      item_category_id: search.item_category_id || undefined,
      collection_type: search.collection_type || undefined,
      status: search.status || undefined,
      lifecycle_status: search.lifecycle_status || undefined,
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
      accommodation_type: search.accommodation_type || undefined,
      admission_year: search.admission_year || undefined
    }),
    [
      search.institution_id,
      search.student_id,
      search.item_category_id,
      search.collection_type,
      search.status,
      search.lifecycle_status,
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
      search.admission_year
    ]
  );

  const fetchData = React.useCallback(
    async (params: DataFetchParams) => {
      try {
        const { data, metadata } = await StudentBillService.getStudentBills({
          page: params.page,
          limit: params.limit,
          search: params.search || undefined,
          sortBy: params.sort_by || undefined,
          sortDirection: (params.sort_order as 'asc' | 'desc') || undefined,
          // College-only, unconditionally. The institution dropdown lists
          // entity_type='institution' only, but "All Institutions" sends no
          // institution_id at all — without this the default view still
          // returned school-fee bills. Same contract as the students list.
          institution_entity_type: 'institution' as const,
          ...dimensionFilters
        });

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
    [dimensionFilters]
  );

  // Powers the "Select all N across pages" banner: returns every bill matching
  // the current filters (capped), so selecting all then bulk-cancelling or
  // deleting acts on the full set rather than just the visible page.
  const fetchAllItemsFn = React.useCallback(
    async (params: DataFetchParams): Promise<StudentBill[]> => {
      const { data } = await StudentBillService.getStudentBills({
        page: 1,
        limit: SELECT_ALL_CAP,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortDirection: (params.sort_order as 'asc' | 'desc') || undefined,
        // Must match fetchData exactly — "Select all across pages" feeds bulk
        // cancel/delete, so a wider set here would act on school-fee bills.
        institution_entity_type: 'institution' as const,
        ...dimensionFilters
      });
      return data || [];
    },
    [dimensionFilters]
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
    async (payload: {
      reasonCode: BillCancelReasonCode;
      reason: string;
      attachments: BillCancellationAttachment[];
    }) => {
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
          payload.reasonCode,
          payload.reason,
          payload.attachments
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
        <div className='flex flex-wrap items-center gap-2'>
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
        fetchAllItemsFn={fetchAllItemsFn}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'student-bills',
          // Keys below are the FLAT keys emitted by transformBillForExport
          // (NOT the bill's nested paths). columnMapping turns each into its
          // sheet header label; `headers` fixes the column order; columnWidths
          // align by index. The transformFunction is what actually populates
          // the cells — without it the export is empty (see helper comment).
          columnMapping: {
            studentName: 'Student',
            institutionName: 'Institution',
            departmentSemester: 'Department / Semester',
            category: 'Category',
            dueDate: 'Due Date',
            amount: 'Amount',
            paymentStatus: 'Status',
            learnerStatus: 'Learner Status',
            billType: 'Type',
            createdAt: 'Created At'
          },
          columnWidths: [
            { wch: 22 },
            { wch: 25 },
            { wch: 28 },
            { wch: 20 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 16 },
            { wch: 12 },
            { wch: 14 }
          ],
          headers: [
            'studentName',
            'institutionName',
            'departmentSemester',
            'category',
            'dueDate',
            'amount',
            'paymentStatus',
            'learnerStatus',
            'billType',
            'createdAt'
          ],
          transformFunction: transformBillForExport
        }}
        idField='id'
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: true,
          enableSearch: true,
          // Spelled out because the search spans the bill AND the learner:
          // bill_description on the bill itself, plus name / roll number /
          // college email resolved against learners_profiles first (PostgREST
          // .or() cannot reach embedded-resource columns — see
          // StudentBillService.getStudentBills).
          searchPlaceholder:
            'Search by student name, roll number, college email or bill description...',
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

      {/* One reason and one document set covers the whole selection — the
          "these twelve rows are the same duplicate" case. Each bill still
          goes through the RPC on its own, so an ineligible one fails alone. */}
      <BillCancelDialog
        open={cancelModal.isOpen}
        onOpenChange={(next) => {
          if (!next) handleCloseCancelModal();
        }}
        bills={cancelModal.selectedBills.map((b) => ({
          id: b.id,
          bill_description: b.bill_description,
          final_amount: b.final_amount,
          status: b.status
        }))}
        institutionName={
          cancelModal.selectedBills[0]?.institution?.name || 'Unknown Institution'
        }
        isPending={cancelModal.isLoading}
        onConfirm={handleConfirmCancel}
      />
    </>
  );
}
