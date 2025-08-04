'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { PromotionFilters } from './_components/promotion-filters';
import { StudentPromotionTable } from './_components/student-promotion-table';
import { StudentFilters } from '@/types/student';
import { BeatLoader } from 'react-spinners';
import { Users, Search, AlertCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StudentService } from '@/lib/services/student/student-service';
import { toast } from 'sonner';

export default function StudentPromotionPage() {
  const queryClient = useQueryClient();
  const [hasSearched, setHasSearched] = useState(false);
  const [filters, setFilters] = useState<StudentFilters>({
    page: 1,
    limit: 10
  });

  const {
    data: studentsData,
    isLoading,
    refetch,
    isError,
    error
  } = useQuery({
    queryKey: ['students', 'promotion', filters],
    queryFn: () => StudentService.getStudents(filters),
    enabled: hasSearched
  });

  const students = studentsData?.data || [];
  const metadata = studentsData?.metadata || {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1
  };

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewStudents =
    isSuperAdmin || canAccess('students.promotion', 'view');
  const canEditStudents =
    isSuperAdmin || canAccess('students.promotion', 'edit');

  const handleFilterChange = (newFilters: Partial<StudentFilters>) => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      ...newFilters,
      page: 1
    }));
  };

  const handleSearch = () => {
    setHasSearched(true);
    refetch();
  };

  const handleReset = () => {
    setHasSearched(false);
    setFilters({
      page: 1,
      limit: 10,
      search: undefined,
      institution: undefined,
      degree: undefined,
      department: undefined,
      program: undefined,
      semester: undefined,
      section: undefined,
      academic_year: undefined
    });
  };

  const changePage = (newPage: number) => {
    setFilters((prevFilters) => ({ ...prevFilters, page: newPage }));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      limit: newPageSize,
      page: 1 // Reset to first page when changing page size
    }));
  };

  const bulkPromoteStudents = async (
    studentIds: string[],
    semesterId: string,
    sectionId: string,
    departmentId?: string,
    academicYearId?: string,
    onProgress?: (progress: number, success: string[], failed: { id: string; error: string }[]) => void
  ): Promise<boolean> => {
    try {
      const result = await StudentService.bulkPromoteStudents(
        studentIds,
        semesterId,
        sectionId,
        departmentId,
        academicYearId,
        onProgress
      );

      if (result.success.length > 0) {
        toast.success(
          `Successfully promoted ${result.success.length} student(s)`
        );

        if (result.failed.length > 0) {
          toast.error(
            `Failed to promote ${result.failed.length} student(s). Check console for details.`
          );
          console.error('Failed promotions:', result.failed);
        }

        // Invalidate all student-related queries to ensure fresh data
        await queryClient.invalidateQueries({ queryKey: ['students'] });
        await refetch();
        return true;
      } else {
        toast.error('No students were promoted successfully.');
        return false;
      }
    } catch (e) {
      toast.error('Failed to promote students.');
      console.error(e);
      return false;
    }
  };

  if (!canViewStudents) {
    return (
      <div className='flex justify-center items-center p-8'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  if (isError && hasSearched) {
    return (
      <ContentLayout title='Student Promotion'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            {error instanceof Error
              ? error.message
              : 'An unknown error occurred'}
          </p>
          <Button variant='outline' onClick={() => refetch()} className='mt-4'>
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
              Use filters to find students, then promote them to new semesters,
              sections, and optionally departments
            </p>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <PromotionFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onSearch={handleSearch}
              onReset={handleReset}
              isSearching={isLoading}
            />

            {!hasSearched && !isLoading && (
              <div className='flex flex-col items-center justify-center py-12 text-center'>
                <div className='rounded-full bg-muted p-3 mb-4'>
                  <Search className='h-8 w-8 text-muted-foreground' />
                </div>
                <h3 className='text-lg font-semibold mb-2'>Ready to Search</h3>
                <p className='text-muted-foreground max-w-md'>
                  Set your filters above and click the <strong>Search</strong>{' '}
                  button to find students for promotion. You can search by name,
                  roll number, or use advanced filters to narrow down results.
                </p>
              </div>
            )}

            {isLoading && (
              <div className='flex flex-col items-center justify-center py-12'>
                <BeatLoader color='#00e902' />
                <p className='text-muted-foreground mt-4'>
                  Searching for students...
                </p>
              </div>
            )}

            {isError && hasSearched && !isLoading && (
              <div className='flex flex-col items-center justify-center py-12 text-center'>
                <div className='rounded-full bg-red-100 p-3 mb-4'>
                  <AlertCircle className='h-8 w-8 text-red-600' />
                </div>
                <h3 className='text-lg font-semibold mb-2'>Search Failed</h3>
                <p className='text-muted-foreground mb-4'>
                  {error instanceof Error
                    ? error.message
                    : 'An unknown error occurred'}
                </p>
                <Button variant='outline' onClick={() => refetch()}>
                  Try Again
                </Button>
              </div>
            )}

            {!isLoading && !isError && hasSearched && students.length === 0 && (
              <div className='flex flex-col items-center justify-center py-12 text-center'>
                <div className='rounded-full bg-muted p-3 mb-4'>
                  <Users className='h-8 w-8 text-muted-foreground' />
                </div>
                <h3 className='text-lg font-semibold mb-2'>
                  No Students Found
                </h3>
                <p className='text-muted-foreground mb-4'>
                  No students match your current filters. Try adjusting your
                  search criteria or reset the filters to see all students.
                </p>
                <div className='flex gap-2'>
                  <Button variant='outline' onClick={handleReset}>
                    Reset Filters
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, search: undefined }));
                      handleSearch();
                    }}
                  >
                    Clear Search
                  </Button>
                </div>
              </div>
            )}

            {!isLoading && !isError && hasSearched && students.length > 0 && (
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <div className='text-sm text-muted-foreground'>
                    Found {metadata.total} student
                    {metadata.total !== 1 ? 's' : ''} matching your criteria
                  </div>
                  <Button variant='outline' size='sm' onClick={handleReset}>
                    New Search
                  </Button>
                </div>

                <StudentPromotionTable
                  students={students}
                  metadata={metadata}
                  onPageChange={changePage}
                  onPageSizeChange={handlePageSizeChange}
                  canEdit={canEditStudents}
                  onBulkPromote={bulkPromoteStudents}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
