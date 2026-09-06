'use client';

import * as React from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { getStudentColumns } from './student-columns';
import { QuickBillDialog } from './quick-bill-dialog';
import type { StudentBillingSearchParams } from './student-data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, Users, FileText } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudentSearchService } from '@/lib/services/billing/schedule/student-search-service';
import { StudentForBilling } from '@/types/billing-schedule';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import toast from 'react-hot-toast';

interface StudentDataTableProps {
  search: StudentBillingSearchParams;
}

export function StudentDataTable({ search }: StudentDataTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();

  // Wait for permissions and profile to be loaded before rendering the table
  const isReady = !permissionsLoading && !!userProfile;

  // Permission checks. "Create Bill" (single) needs only create; "Bulk Create
  // Bills" additionally needs bulk_create — create stays in the expression
  // because it is what the RLS INSERT policy on billing_student_bills checks.
  const canCreateBills =
    isSuperAdmin || canAccess('billing.schedule', 'create');
  const canBulkCreate =
    isSuperAdmin ||
    (canAccess('billing.schedule', 'create') &&
      canAccess('billing.schedule', 'bulk_create'));

  // Student popup state. Holds the ROW OBJECT, not an id — the row already
  // carries everything the bill form and the popup header need, so opening it
  // costs zero network calls. `tab` decides which face opens: read the
  // existing bills, or raise a new one.
  const [popup, setPopup] = React.useState<{
    student: StudentForBilling;
    tab: 'new' | 'bills';
  } | null>(null);

  // Defaults to 'bills' — the first tab, and the "what do they already owe"
  // question the old detail-page redirect answered. Callers with explicit
  // billing intent (the Bill button, a barcode scan) pass 'new'.
  const openStudentPopup = React.useCallback(
    (student: StudentForBilling, tab: 'new' | 'bills' = 'bills') =>
      setPopup({ student, tab }),
    []
  );

  // Which scanned term already auto-opened its popup (see fetchData below).
  const autoOpenedTermRef = React.useRef<string | null>(null);

  // DataTable's fetchDataFn path bypasses React Query, so invalidateQueries
  // cannot refresh this list. Bumping refetchKey is the table's own hook for
  // "re-run the fetch" — used after a bill is created so the Outstanding
  // column reflects it immediately.
  const [refetchKey, setRefetchKey] = React.useState(0);

  // Check if we have meaningful search criteria (now optional - allows viewing all students)
  const hasSearchCriteria = React.useMemo(() => {
    return !!(
      search.institution_id ||
      search.academic_year_id ||
      search.degree_id ||
      search.department_id ||
      search.program_id ||
      search.semester_id ||
      search.section_id ||
      search.accommodation_type ||
      search.q ||
      search.first_name ||
      search.last_name ||
      search.roll_number ||
      search.register_number ||
      search.mobile_number
    );
  }, [search]);

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
        // Map the DataTable parameters to our StudentSearchService parameters
        const filters = {
          page: params.page,
          limit: params.limit,
          // The DataTable's own search box and the page's unified box feed the
          // same multi-column `query`. It used to be routed into `first_name`
          // only, so typing a roll number into the table search found nothing.
          query: params.search || search.q || undefined,
          first_name: search.first_name || undefined,
          last_name: search.last_name || undefined,
          roll_number: search.roll_number || undefined,
          register_number: search.register_number || undefined,
          mobile_number: search.mobile_number || undefined,
          institution_id:
            search.institution_id ||
            (!isSuperAdmin && userProfile?.institution_id
              ? userProfile.institution_id
              : undefined),
          // Hard-scope this list to COLLEGE learners. The institution dropdown
          // already offers only entity_type='institution', but with "All
          // institutions" selected there is no institution_id to narrow on,
          // so school / office learners would otherwise appear here.
          institution_entity_type: 'institution' as const,
          academic_year_id: search.academic_year_id || undefined,
          degree_id: search.degree_id || undefined,
          department_id: search.department_id || undefined,
          program_id: search.program_id || undefined,
          semester_id: search.semester_id || undefined,
          section_id: search.section_id || undefined,
          accommodation_type: search.accommodation_type || undefined,
          is_profile_complete: search.is_profile_complete
        };

        const { data, metadata } =
          await StudentSearchService.searchStudentsForBilling(filters);

        // Zero-click path: a barcode scan identifies exactly one learner, so
        // open their bill popup as soon as the result lands. Guarded four
        // ways — only for a scan (search.scan==='1', never a typed search),
        // only on page 1, only when the result is unambiguous, and only once
        // per scanned term, so closing the popup does not reopen it.
        if (
          search.scan === '1' &&
          params.page === 1 &&
          data?.length === 1 &&
          autoOpenedTermRef.current !== search.q
        ) {
          autoOpenedTermRef.current = search.q ?? null;
          const onlyMatch = data[0];
          // Lands on Existing Bills like every other automatic open: the scan
          // says WHO, not what to do with them, and reading the dues before
          // raising another bill is what stops duplicate bills for the same
          // fee. Only the explicit Bill button jumps straight to the form.
          // Deferred: this runs inside the table's fetch, and setting state
          // synchronously there would update a component mid-render.
          setTimeout(
            () => setPopup({ student: onlyMatch, tab: 'bills' }),
            0
          );
        }

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
        console.error('Error fetching students:', error);
        throw error;
      }
    },
    [
      search.q,
      search.scan,
      search.first_name,
      search.last_name,
      search.roll_number,
      search.register_number,
      search.mobile_number,
      search.institution_id,
      search.academic_year_id,
      search.degree_id,
      search.department_id,
      search.program_id,
      search.semester_id,
      search.section_id,
      search.accommodation_type,
      search.is_profile_complete,
      isSuperAdmin,
      // `userProfile`, not `userProfile?.institution_id`: React Compiler
      // infers the whole object as the dependency and refuses to preserve the
      // memo when the written dep is narrower, which silently opts this
      // callback out of compilation.
      userProfile
    ]
  );

  const handleBulkCreateBills = React.useCallback(
    async (selectedRows: StudentForBilling[], resetSelection: () => void) => {
      if (selectedRows.length === 0) return;

      // Use toast for confirmation instead of window.confirm
      const createToast = toast.loading(
        `Creating bills for ${selectedRows.length} student${selectedRows.length > 1 ? 's' : ''}...`
      );

      try {
        // Navigate to bulk create page with selected student IDs
        const studentIds = selectedRows.map((student) => student.id);
        const queryParams = new URLSearchParams();
        queryParams.set('student_ids', studentIds.join(','));

        router.push(`/billing/schedule/bulk-create?${queryParams.toString()}`);
        resetSelection();

        // Success toast
        toast.success(
          `Redirecting to create bills for ${selectedRows.length} student${selectedRows.length > 1 ? 's' : ''}`,
          { id: createToast }
        );
      } catch (error) {
        console.error('Error navigating to bulk create:', error);

        // Error toast
        toast.error('Failed to navigate to bulk create page. Please try again.', {
          id: createToast
        });
      }
    },
    [router]
  );

  // The search this table is currently showing, filters and page included.
  // Threaded into each name link as `?returnTo=` so the detail page can send
  // the operator back to these exact results — same contract as
  // /billing/onboarding and /billing/transport.
  const returnToUrl = React.useMemo(() => {
    const qs = searchParams.toString();
    return `/billing/schedule/students${qs ? `?${qs}` : ''}`;
  }, [searchParams]);

  // Memoized so the table does not rebuild every column on each render (which
  // would reset column resizing and re-mount every cell).
  const tableColumns = React.useMemo(
    () =>
      getStudentColumns({
        onQuickBill: openStudentPopup,
        canCreateBills,
        returnToUrl
      }),
    [canCreateBills, openStudentPopup, returnToUrl]
  );

  const getColumns = React.useCallback(() => tableColumns as any, [
    tableColumns
  ]);

  const renderCustomToolbar = React.useCallback(
    (props: {
      selectedRows: any[];
      allSelectedIds: (string | number)[];
      totalSelectedCount: number;
      resetSelection: () => void;
    }) => (
      <div className='flex flex-wrap items-center gap-2'>
        {canCreateBills && (
          <Button
            onClick={() => router.push('/billing/schedule/new')}
            size='sm'
            className='h-8'
          >
            <Plus className='mr-2 h-4 w-4' />
            Create Bill
          </Button>
        )}

        {canBulkCreate && props.selectedRows.length > 0 && (
          <>
            <Button
              onClick={() =>
                handleBulkCreateBills(
                  props.selectedRows as StudentForBilling[],
                  props.resetSelection
                )
              }
              variant='outline'
              size='sm'
              className='h-8'
            >
              <Users className='mr-2 h-4 w-4' />
              Bulk Create Bills ({props.selectedRows.length})
            </Button>
            <Button
              onClick={() => {
                // Handle bulk export
                console.log('Export selected students:', props.selectedRows);
              }}
              variant='outline'
              size='sm'
              className='h-8'
            >
              <FileText className='mr-2 h-4 w-4' />
              Export Selected ({props.selectedRows.length})
            </Button>
          </>
        )}
      </div>
    ),
    [canCreateBills, canBulkCreate, router, handleBulkCreateBills]
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

  // Show informational message when no search criteria are applied
  const showSearchHint = !hasSearchCriteria;

  // Note: We removed the early return here to allow viewing all students without filters

  return (
    <>
    <DataTable
      fetchDataFn={fetchData}
      getColumns={getColumns}
      refetchKey={refetchKey}
      exportConfig={{
        entityName: 'students-for-billing',
        // `headers` are DATA KEYS; columnMapping supplies the heading. This
        // config previously declared the LABELS as headers (and dotted paths
        // like 'institution.name' as mapping keys, which the export does not
        // resolve either), so nothing matched and the download opened blank.
        // transformFunction flattens the relations into the keys below.
        columnMapping: {
          roll_number: 'Roll Number',
          register_number: 'Register Number',
          first_name: 'First Name',
          last_name: 'Last Name',
          father_name: 'Father Name',
          institution_name: 'Institution',
          department_name: 'Department',
          program_name: 'Program',
          semester_name: 'Semester',
          outstanding_amount: 'Outstanding Amount',
          mobile_number: 'Mobile Number',
          college_email: 'College Email'
        },
        columnWidths: [
          { wch: 15 }, // Roll Number
          { wch: 18 }, // Register Number
          { wch: 15 }, // First Name
          { wch: 15 }, // Last Name
          { wch: 20 }, // Father Name
          { wch: 30 }, // Institution
          { wch: 25 }, // Department
          { wch: 25 }, // Program
          { wch: 15 }, // Semester
          { wch: 18 }, // Outstanding Amount
          { wch: 15 }, // Mobile Number
          { wch: 25 } // College Email
        ],
        headers: [
          'roll_number',
          'register_number',
          'first_name',
          'last_name',
          'father_name',
          'institution_name',
          'department_name',
          'program_name',
          'semester_name',
          'outstanding_amount',
          'mobile_number',
          'college_email'
        ],
        transformFunction: ((row: StudentForBilling) => ({
          roll_number: row.roll_number ?? '',
          register_number: row.register_number ?? '',
          first_name: row.first_name ?? '',
          last_name: row.last_name ?? '',
          father_name: row.father_name ?? '',
          institution_name: row.institution?.name ?? '',
          department_name: row.department?.department_name ?? '',
          program_name: row.program?.program_name ?? '',
          semester_name: row.semester?.semester_name ?? '',
          outstanding_amount: row.outstanding_amount ?? 0,
          mobile_number: row.mobile_number ?? '',
          college_email: row.college_email ?? ''
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any
      }}
      idField='id'
      config={{
        enableUrlState: false, // Disable URL state management in DataTable to prevent conflicts
        enableDateFilter: false,
        enableExport: true,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'student-billing-search-table'
      }}
      renderToolbarContent={renderCustomToolbar}
    />

    {/* Everything a clerk does to one student happens here, over the results.
        Closing it leaves them exactly where they were — same search, same
        page, same scroll position. */}
    {/* The key remounts the popup whenever a different student — or a
        different tab of the same student — is requested. That is what lets
        QuickBillDialog initialize its tab and lazy-fetch flags from props at
        mount instead of syncing them in an effect (which React flags as a
        cascading render, and which flashed the previous learner's bills). */}
    <QuickBillDialog
      key={popup ? `${popup.student.id}:${popup.tab}` : 'closed'}
      student={popup?.student ?? null}
      initialTab={popup?.tab ?? 'bills'}
      open={!!popup}
      onOpenChange={(open) => {
        if (!open) setPopup(null);
      }}
      onCreated={() => setRefetchKey((k) => k + 1)}
    />
    </>
  );
}
