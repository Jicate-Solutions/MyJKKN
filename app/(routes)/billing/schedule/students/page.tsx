'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
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
  const { profile, isLoading: authLoading } = useAuth();

  // Check if user is a student
  const isStudent = profile?.role === 'student';
  const studentEmail = isStudent ? profile?.email : undefined;

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
      accommodation_type: searchParams.get('accommodation_type') || undefined,
      q: searchParams.get('q') || undefined,
      scan: searchParams.get('scan') || undefined,
      first_name: searchParams.get('first_name') || undefined,
      last_name: searchParams.get('last_name') || undefined,
      roll_number: searchParams.get('roll_number') || undefined,
      register_number: searchParams.get('register_number') || undefined,
      mobile_number: searchParams.get('mobile_number') || undefined,
      is_profile_complete:
        searchParams.get('is_profile_complete') === 'true' ? true : undefined,
      // If student, filter by their email automatically
      student_email: isStudent ? studentEmail : searchParams.get('student_email') || undefined
    });
  }, [searchParams, isStudent, studentEmail]);

  // Simplified filter state management - derive filters from search params
  const filters = useMemo(() => {
    return {
      page: search.page,
      limit: search.pageSize,
      query: search.q,
      first_name: search.first_name,
      last_name: search.last_name,
      roll_number: search.roll_number,
      register_number: search.register_number,
      mobile_number: search.mobile_number,
      institution_id: search.institution_id,
      academic_year_id: search.academic_year_id,
      degree_id: search.degree_id,
      department_id: search.department_id,
      program_id: search.program_id,
      semester_id: search.semester_id,
      section_id: search.section_id,
      accommodation_type: search.accommodation_type,
      is_profile_complete: search.is_profile_complete
    };
  }, [search]);

  // For backward compatibility with filters component, we still need this hook
  // but the actual data fetching will be handled by the DataTable
  const hasActiveFilters = !!(
    search.q ||
    search.first_name ||
    search.roll_number ||
    search.register_number ||
    search.mobile_number ||
    search.institution_id ||
    search.academic_year_id ||
    search.degree_id ||
    search.department_id ||
    search.program_id ||
    search.semester_id ||
    search.section_id ||
    search.accommodation_type
  );

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewStudents = isSuperAdmin || canAccess('billing.schedule', 'view');

  // `scan` is a UI-transport flag, not a learner attribute, so it rides
  // alongside the domain filters rather than inside StudentSearchFilters.
  const handleFilterChange = (
    newFilters: Partial<StudentSearchFiltersType> & { scan?: string }
  ) => {
    const params = new URLSearchParams(searchParams);

    // Update URL params with new filter values. The unified search box travels
    // as `query` in the filter object but as the shorter `q` in the URL, so a
    // scanned link stays readable — translate it here rather than teaching the
    // filters component two names for one thing.
    Object.entries(newFilters).forEach(([key, value]) => {
      const paramKey = key === 'query' ? 'q' : key;
      if (value !== undefined && value !== null && value !== '') {
        params.set(paramKey, value.toString());
      } else {
        params.delete(paramKey);
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

  if (permissionsLoading || authLoading) {
    return (
      <ContentLayout title={isStudent ? 'My Bills' : 'Student Billing Search'}>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewStudents) {
    return (
      <ContentLayout title={isStudent ? 'My Bills' : 'Student Billing Search'}>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing information.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const pageTitle = isStudent ? 'My Bills' : 'Student Billing Search';
  const pageDescription = isStudent
    ? 'View your billing information and payment history'
    : 'Search and manage student billing information with advanced filters';

  return (
    <ContentLayout title={pageTitle}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: isStudent ? 'My Bills' : 'Students', href: '/billing/schedule/students' }
        ]}
      />

      {/* Tightened from space-y-6/mt-4 + a two-line header + p-6 card padding.
          Those cost ~150 px above the search box, so on a laptop the clerk saw
          the filters and about two result rows. */}
      <div className='space-y-3 mt-3'>
        <div>
          <h1 className='text-xl font-bold'>{pageTitle}</h1>
          <p className='text-sm text-muted-foreground'>{pageDescription}</p>
        </div>

        <Card>
          <CardContent className='p-3 sm:p-4'>
            {/* Hide search filters for students - they only see their own data */}
            {!isStudent && (
              <StudentSearchFilters
                filters={filters}
                onFilterChange={handleFilterChange}
              />
            )}

            <div className={isStudent ? '' : 'mt-4'}>
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
