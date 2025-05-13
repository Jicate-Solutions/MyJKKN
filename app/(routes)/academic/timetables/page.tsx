'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useTimetables } from '@/hooks/academic/use-timetables';
import Loading from '@/components/Loading/Loading';
import { usePermissions } from '@/hooks/use-permissions';
import { TimetableTable } from './_components/timetable-table';

import { Pagination } from '../periods/_components/pagination';
import { TimetableFilters } from './_components/timetable-filters';
import { TimetableEmptyState } from './_components/timetable-empty-state';

export default function TimetablesPage() {
  const {
    timetables,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchTimetables,
    deleteTimetable
  } = useTimetables({ limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewTimetables =
    isSuperAdmin || canAccess('academic.timetables', 'view');
  const canCreateTimetables =
    isSuperAdmin || canAccess('academic.timetables', 'create');
  const canEditTimetables =
    isSuperAdmin || canAccess('academic.timetables', 'edit');
  const canDeleteTimetables =
    isSuperAdmin || canAccess('academic.timetables', 'delete');

  useEffect(() => {
    fetchTimetables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canViewTimetables) {
    return <Loading title='Loading timetables...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Timetables'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchTimetables()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Timetables'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Timetables</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Timetables</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage timetables for academic scheduling
            </p>
          </div>
          {canCreateTimetables ? (
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/academic/timetables/new'>
                <Plus className='mr-2 h-4 w-4' />
                Create Timetable
              </Link>
            </Button>
          ) : (
            <Button
              className='w-full sm:w-auto opacity-50'
              disabled
              variant='outline'
            >
              <Plus className='mr-2 h-4 w-4' />
              Create Timetable
            </Button>
          )}
        </div>

        <Card>
          <CardContent className='p-6'>
            <TimetableFilters
              filters={filters}
              onFilterChange={updateFilters}
            />

            {loading && <Loading title='Loading timetables...' />}

            {!loading && !error && timetables.length === 0 && (
              <TimetableEmptyState canCreate={canCreateTimetables} />
            )}

            {!loading && !error && timetables.length > 0 && (
              <>
                <TimetableTable
                  timetables={timetables}
                  deleteTimetable={deleteTimetable}
                  canEdit={canEditTimetables}
                  canDelete={canDeleteTimetables}
                />
                <Pagination
                  currentPage={metadata.page}
                  totalPages={metadata.totalPages}
                  onPageChange={changePage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
