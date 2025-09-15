'use client';

import * as React from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './student-columns';
import type { StudentBillingSearchParams } from './student-data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, Users, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StudentSearchService } from '@/lib/services/billing/schedule/student-search-service';
import { StudentForBilling } from '@/types/billing-schedule';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';

interface StudentDataTableProps {
  search: StudentBillingSearchParams;
}

export function StudentDataTable({ search }: StudentDataTableProps) {
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
  const canBulkCreate = isSuperAdmin || canAccess('billing.schedule', 'create');

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
      search.first_name ||
      search.last_name ||
      search.roll_number ||
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
          first_name: params.search || search.first_name || undefined,
          last_name: search.last_name || undefined,
          roll_number: search.roll_number || undefined,
          mobile_number: search.mobile_number || undefined,
          institution_id:
            search.institution_id ||
            (!isSuperAdmin && userProfile?.institution_id
              ? userProfile.institution_id
              : undefined),
          academic_year_id: search.academic_year_id || undefined,
          degree_id: search.degree_id || undefined,
          department_id: search.department_id || undefined,
          program_id: search.program_id || undefined,
          semester_id: search.semester_id || undefined,
          section_id: search.section_id || undefined,
          is_profile_complete: search.is_profile_complete
        };

        const { data, metadata } =
          await StudentSearchService.searchStudentsForBilling(filters);

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
      search.first_name,
      search.last_name,
      search.roll_number,
      search.mobile_number,
      search.institution_id,
      search.academic_year_id,
      search.degree_id,
      search.department_id,
      search.program_id,
      search.semester_id,
      search.section_id,
      search.is_profile_complete,
      isSuperAdmin,
      userProfile?.institution_id
    ]
  );

  const handleBulkCreateBills = React.useCallback(
    async (selectedRows: StudentForBilling[], resetSelection: () => void) => {
      if (selectedRows.length === 0) return;

      const confirmed = window.confirm(
        `Are you sure you want to create bills for ${
          selectedRows.length
        } student${selectedRows.length > 1 ? 's' : ''}?`
      );

      if (!confirmed) return;

      try {
        // Navigate to bulk create page with selected student IDs
        const studentIds = selectedRows.map((student) => student.id);
        const queryParams = new URLSearchParams();
        queryParams.set('student_ids', studentIds.join(','));

        router.push(`/billing/schedule/bulk-create?${queryParams.toString()}`);
        resetSelection();
      } catch (error) {
        console.error('Error navigating to bulk create:', error);
      }
    },
    [router]
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
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{
        entityName: 'students-for-billing',
        columnMapping: {
          roll_number: 'Roll Number',
          first_name: 'First Name',
          last_name: 'Last Name',
          father_name: 'Father Name',
          'institution.name': 'Institution',
          'department.department_name': 'Department',
          'program.program_name': 'Program',
          'semester.semester_name': 'Semester',
          outstanding_amount: 'Outstanding Amount',
          mobile_number: 'Mobile Number',
          college_email: 'College Email'
        },
        columnWidths: [
          { wch: 15 }, // Roll Number
          { wch: 15 }, // First Name
          { wch: 15 }, // Last Name
          { wch: 20 }, // Father Name
          { wch: 30 }, // Institution & Department
          { wch: 25 }, // Program & Semester
          { wch: 18 }, // Outstanding Amount
          { wch: 15 }, // Mobile Number
          { wch: 25 } // College Email
        ],
        headers: [
          'Roll Number',
          'First Name',
          'Last Name',
          'Father Name',
          'Institution & Department',
          'Program & Semester',
          'Outstanding Amount',
          'Mobile Number',
          'College Email'
        ]
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
  );
}
