'use client';

import { useState } from 'react';
import { Download, Users, FileText, Info } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';
import { StudentSearchFilters } from './_components/student-search-filters';
import { useStudentsForBilling } from '@/hooks/billing/use-student-search';
import type { StudentSearchFilters as StudentSearchFiltersType } from '@/types/billing-schedule';
import { StudentListForBilling } from './_components/student-list-for-billing';

export default function BillingStudentsPage() {
  const [filters, setFilters] = useState<StudentSearchFiltersType>({
    page: 1,
    limit: 20
  });

  const {
    data: studentsData,
    isLoading,
    error,
    refetch,
    hasPerformedSearch
  } = useStudentsForBilling(filters);

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewStudents = isSuperAdmin || canAccess('billing.schedule', 'view');

  const handleFilterChange = (
    newFilters: Partial<StudentSearchFiltersType>
  ) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page || 1
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
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

  if (error && hasPerformedSearch) {
    return (
      <ContentLayout title='Student Billing Search'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Billing', href: '/billing' },
            { label: 'Schedule', href: '/billing/schedule' },
            { label: 'Students', href: '/billing/schedule/students' }
          ]}
        />
        <div className='mt-4 text-center py-8'>
          <p className='text-destructive'>
            Error loading students: {error.message}
          </p>
          <Button variant='outline' onClick={() => refetch()} className='mt-4'>
            Try Again
          </Button>
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
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button
              variant='outline'
              onClick={handleExport}
              disabled={!studentsData?.data.length}
            >
              <Download className='mr-2 h-4 w-4' />
              Export List
            </Button>
          </div>
        </div>

        {hasPerformedSearch && studentsData && studentsData.data.length > 0 && (
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Matching Students
                </CardTitle>
                <Users className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>
                  {studentsData?.metadata.total || 0}
                </div>
                <p className='text-xs text-muted-foreground'>Students found</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  With Outstanding
                </CardTitle>
                <FileText className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-orange-600'>
                  {studentsData?.data.filter(
                    (student) => student.outstanding_amount > 0
                  ).length || 0}
                </div>
                <p className='text-xs text-muted-foreground'>
                  Have pending dues
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Total Outstanding
                </CardTitle>
                <FileText className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-red-600'>
                  ₹
                  {studentsData?.data
                    .reduce(
                      (sum, student) => sum + student.outstanding_amount,
                      0
                    )
                    .toLocaleString() || 0}
                </div>
                <p className='text-xs text-muted-foreground'>
                  Total amount due
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Avg Outstanding
                </CardTitle>
                <FileText className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>
                  ₹
                  {studentsData?.data.length
                    ? Math.round(
                        studentsData.data.reduce(
                          (sum, student) => sum + student.outstanding_amount,
                          0
                        ) / studentsData.data.length
                      ).toLocaleString()
                    : 0}
                </div>
                <p className='text-xs text-muted-foreground'>Per student</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardContent className='p-6'>
            <StudentSearchFilters
              filters={filters}
              onFilterChange={handleFilterChange}
            />

            {isLoading ? (
              <div className='flex flex-col justify-center items-center p-8 min-h-[200px]'>
                <BeatLoader color='#00e902' />
                <p className='mt-4 text-sm text-muted-foreground'>
                  Searching for students...
                </p>
              </div>
            ) : !hasPerformedSearch ? (
              <div className='flex flex-col justify-center items-center p-8 min-h-[200px] text-center'>
                <Info className='h-10 w-10 text-blue-500 mb-4' />
                <p className='text-lg font-semibold'>Begin Your Search</p>
                <p className='text-sm text-muted-foreground'>
                  Use the filters above to find specific students.
                </p>
              </div>
            ) : studentsData && studentsData.data.length > 0 ? (
              <StudentListForBilling
                students={studentsData.data}
                metadata={studentsData.metadata}
                onPageChange={handlePageChange}
                onRefresh={() => refetch()}
              />
            ) : (
              <div className='flex flex-col justify-center items-center p-8 min-h-[200px] text-center'>
                <Users className='h-10 w-10 text-muted-foreground mb-4' />
                <p className='text-lg font-semibold'>No Students Found</p>
                <p className='text-sm text-muted-foreground'>
                  Try adjusting your search filters or try a different query.
                </p>
                {hasPerformedSearch && (
                  <Button
                    variant='outline'
                    onClick={() => setFilters({ page: 1, limit: 20 })}
                    className='mt-4'
                  >
                    Clear Filters & Start Over
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
