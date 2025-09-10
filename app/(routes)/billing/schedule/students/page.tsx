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

  // Legacy filter state for the search filters component - memoized to prevent recreation
  const [filters, setFilters] = useState(() => {
    const urlFilters = {
      page: search.page,
      limit: search.pageSize
    } as any;

    // Copy search parameters to legacy filter format
    Object.keys(search).forEach((key) => {
      if (
        search[key as keyof typeof search] !== undefined &&
        key !== 'page' &&
        key !== 'pageSize'
      ) {
        urlFilters[key] = search[key as keyof typeof search];
      }
    });

    return urlFilters;
  });

  // Update filters when search params change but avoid unnecessary updates
  useEffect(() => {
    const newFilters = {
      page: search.page,
      limit: search.pageSize
    } as any;

    Object.keys(search).forEach((key) => {
      if (
        search[key as keyof typeof search] !== undefined &&
        key !== 'page' &&
        key !== 'pageSize'
      ) {
        newFilters[key] = search[key as keyof typeof search];
      }
    });

    // Only update if filters actually changed
    const hasChanged = JSON.stringify(filters) !== JSON.stringify(newFilters);
    if (hasChanged) {
      setFilters(newFilters);
    }
  }, [search, filters]);

  // Update URL when filters change (debounced to prevent excessive updates)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const params = new URLSearchParams();

      // Add filter parameters to URL
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, value.toString());
        }
      });

      // Update URL without triggering navigation
      const newUrl = params.toString() ? `?${params.toString()}` : '';
      const currentUrl = window.location.search;

      if (currentUrl !== newUrl) {
        router.replace(`/billing/schedule/students${newUrl}`, {
          scroll: false
        });
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [filters, router]);

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
    setFilters((prev: StudentSearchFiltersType) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page || 1
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev: StudentSearchFiltersType) => ({ ...prev, page }));
  };

  const handleClearFilters = () => {
    setFilters({ page: 1, limit: 20 });
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
