'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { GraduatedDataTable } from './_components/graduated-data-table';
import { GraduatedFilters } from './_components/graduated-filters';
import { graduatedSearchParamsSchema } from './_components/data-table-schema';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BarChart3, Users } from 'lucide-react';
import { CanView } from '@/components/auth/permission-guard';

export default function GraduatedStudentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = graduatedSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

  // Redirect to include default filters if not present
  useEffect(() => {
    const needsRedirect = !searchParams.has('status');

    if (needsRedirect) {
      const params = new URLSearchParams(searchParams);
      if (!searchParams.has('status')) {
        params.set('status', 'graduated,exited');
      }
      router.replace(`/students/graduated?${params.toString()}`);
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
      router.push(`/students/graduated?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    if (searchParams.get('pageSize')) {
      params.set('pageSize', searchParams.get('pageSize')!);
    }
    router.push(`/students/graduated?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <ContentLayout title='Graduated & Exited Learners'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners', href: '/students' },
          { label: 'Graduated & Exited' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col sm:flex-row justify-between items-start gap-4'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Graduated & Exited Learners</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              View and manage learners who have graduated or exited the institution
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
            <Link href='/students'>
              <Button variant='outline' size='sm'>
                <Users className='h-4 w-4 mr-2' />
                Active Learners
              </Button>
            </Link>
          </div>
        </div>

        <GraduatedFilters
          searchParams={search}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />
        <GraduatedDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
