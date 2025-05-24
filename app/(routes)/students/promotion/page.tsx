'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useStudentsPromotion } from '@/hooks/student/use-students';
import { PromotionFilters } from './_components/promotion-filters';
import { StudentPromotionTable } from './_components/student-promotion-table';
import Loading from '@/components/Loading/Loading';
import { StudentFilters } from '@/types/student';

export default function StudentPromotionPage() {
  const {
    students,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchStudents,
    bulkPromoteStudents
  } = useStudentsPromotion({ limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewStudents =
    isSuperAdmin || canAccess('students.promotion', 'view');
  const canEditStudents =
    isSuperAdmin || canAccess('students.promotion', 'edit');

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (newFilters: Partial<StudentFilters>) => {
    updateFilters({
      ...newFilters,
      page: 1
    });
  };

  if (!canViewStudents) {
    return <Loading title='Checking permissions...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Student Promotion'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchStudents()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Student Promotion'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Students', href: '/students' },
          { label: 'Promotion' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Student Promotion</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Promote students to new semesters and sections
            </p>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <PromotionFilters
              filters={filters}
              onFilterChange={handleFilterChange}
            />

            {loading && <Loading title='Loading students...' />}

            {!loading && !error && (
              <StudentPromotionTable
                students={students}
                metadata={metadata}
                onPageChange={changePage}
                canEdit={canEditStudents}
                onBulkPromote={bulkPromoteStudents}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
