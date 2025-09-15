'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';
import { StudentSearchFilters } from './_components/student-search-filters';
import { StudentDataTable } from './_components/student-data-table';
import {
  studentBillingSearchParamsSchema,
  type StudentBillingSearchParams
} from './_components/student-data-table-schema';
import type { StudentSearchFilters as StudentSearchFiltersType } from '@/types/billing-schedule';

function BillingStudentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Memoize search object parsing to prevent recreation on every render
  const search = useMemo(() => {
    return studentBillingSearchParamsSchema.parse({
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '20'),
      search: searchParams.get('search') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined,

      // Student search filters
      institution_id: searchParams.get('institution_id') || undefined,
      academic_year_id: searchParams.get('academic_year_id') || undefined,
      degree_id: searchParams.get('degree_id') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      program_id: searchParams.get('program_id') || undefined,
      semester_id: searchParams.get('semester_id') || undefined,
      section_id: searchParams.get('section_id') || undefined,
      first_name: searchParams.get('first_name') || undefined,
      last_name: searchParams.get('last_name') || undefined,
      roll_number: searchParams.get('roll_number') || undefined,
      mobile_number: searchParams.get('mobile_number') || undefined,
      is_profile_complete:
        searchParams.get('is_profile_complete') === 'true' ? true : undefined
    });
  }, [searchParams]);

  // Simplified filter state management - derive filters from search params
  const filters = useMemo(() => {
    return {
      page: search.page,
      limit: search.pageSize,
      first_name: search.first_name,
      last_name: search.last_name,
      roll_number: search.roll_number,
      mobile_number: search.mobile_number,
      institution_id: search.institution_id,
      academic_year_id: search.academic_year_id,
      degree_id: search.degree_id,
      department_id: search.department_id,
      program_id: search.program_id,
      semester_id: search.semester_id,
      section_id: search.section_id,
      is_profile_complete: search.is_profile_complete
    };
  }, [search]);

  // For backward compatibility with filters component, we still need this hook
  // but the actual data fetching will be handled by the DataTable
  const hasActiveFilters = !!(
    search.first_name ||
    search.roll_number ||
    search.mobile_number ||
    search.institution_id ||
    search.academic_year_id ||
    search.degree_id ||
    search.department_id ||
    search.program_id ||
    search.semester_id ||
    search.section_id
  );

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewStudents = isSuperAdmin || canAccess('billing.schedule', 'view');

  const handleFilterChange = (
    newFilters: Partial<StudentSearchFiltersType>
  ) => {
    const params = new URLSearchParams(searchParams);

    // Update URL params with new filter values
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, value.toString());
      } else {
        params.delete(key);
      }
    });

    // Reset to page 1 when filters change (unless explicitly setting page)
    if (!('page' in newFilters)) {
      params.set('page', '1');
    }

    // Update URL
    const newUrl = params.toString() ? `?${params.toString()}` : '';
    router.replace(`/billing/schedule/students${newUrl}`, { scroll: false });
  };

  const handlePageChange = (page: number) => {
    handleFilterChange({ page });
  };

  const handleClearFilters = () => {
    router.replace('/billing/schedule/students', { scroll: false });
  };

  const handleExport = () => {
    console.log('Export students list with filters:', filters);
  };

  if (permissionsLoading) {
    return (
      <ContentLayout title='Student Billing Search'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewStudents) {
    return (
      <ContentLayout title='Student Billing Search'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view student billing information.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Student Billing Search'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Students', href: '/billing/schedule/students' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Student Billing Search</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Search and manage student billing information with advanced
              filters
            </p>
          </div>
          {/* Export functionality is now handled by the DataTable component */}
        </div>

        {/* Statistics cards will be integrated into the DataTable */}

        <Card>
          <CardContent className='p-6'>
            <StudentSearchFilters
              filters={filters}
              onFilterChange={handleFilterChange}
            />

            <div className='mt-6'>
              <StudentDataTable search={search} />
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default function BillingStudentsPage() {
  return (
    <Suspense
      fallback={
        <ContentLayout title='Student Billing Search'>
          <div className='flex items-center justify-center min-h-[400px]'>
            <BeatLoader color='#00e902' />
          </div>
        </ContentLayout>
      }
    >
      <BillingStudentsContent />
    </Suspense>
  );
}
