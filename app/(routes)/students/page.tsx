'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { StudentsDataTable } from './_components/students-data-table';
import { StudentFilters } from './_components/student-filters';
import { studentsSearchParamsSchema } from './_components/data-table-schema';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BarChart3, UserCheck } from 'lucide-react';
import { CanView, CanCreate } from '@/components/auth/permission-guard';

export default function StudentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = studentsSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

  // Redirect to include default is_profile_complete filter if not present
  useEffect(() => {
    if (!searchParams.has('is_profile_complete')) {
      const params = new URLSearchParams(searchParams);
      params.set('is_profile_complete', 'true');
      router.replace(`/students?${params.toString()}`);
    }
  }, [searchParams, router]);

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`/students?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    if (searchParams.get('pageSize')) {
      params.set('pageSize', searchParams.get('pageSize')!);
    }
    router.push(`/students?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <ContentLayout title='Students'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Students' },
          { label: 'Student Management' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col sm:flex-row justify-between items-start gap-4'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Students</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage and view all student records
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <CanView module='students.analytics'>
              <Link href='/students/dashboard'>
                <Button variant='outline' size='sm'>
                  <BarChart3 className='h-4 w-4 mr-2' />
                  Analytics Dashboard
                </Button>
              </Link>
            </CanView>
            <CanCreate module='students'>
              <Link href='/students/onboarding'>
                <Button variant='outline' size='sm'>
                  <UserCheck className='h-4 w-4 mr-2' />
                  Onboarding
                </Button>
              </Link>
            </CanCreate>
          </div>
        </div>
        <StudentFilters
          searchParams={search}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />
        <StudentsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
