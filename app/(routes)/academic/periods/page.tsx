'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { usePeriods } from '@/hooks/academic/use-periods';
import { PeriodTable } from './_components/period-table';
import { Pagination } from './_components/pagination';
import { PeriodFilters } from './_components/period-filters';
import Loading from '@/components/Loading/Loading';
import { PeriodEmptyState } from './_components/period-empty-state';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';

export default function PeriodsPage() {
  const {
    periods,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchPeriods,
    deletePeriod
  } = usePeriods({ limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewPeriods = isSuperAdmin || canAccess('academic.periods', 'view');
  const canCreatePeriods =
    isSuperAdmin || canAccess('academic.periods', 'create');
  const canEditPeriods = isSuperAdmin || canAccess('academic.periods', 'edit');
  const canDeletePeriods =
    isSuperAdmin || canAccess('academic.periods', 'delete');

  useEffect(() => {
    fetchPeriods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canViewPeriods) {
    return <Loading title='Loading academic periods...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Academic Periods'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchPeriods()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Academic Periods'>
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
            <BreadcrumbPage>Periods</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Academic Periods</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage academic periods for timetable scheduling
            </p>
          </div>
          {canCreatePeriods ? (
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/academic/periods/new'>
                <Plus className='mr-2 h-4 w-4' />
                Create Period
              </Link>
            </Button>
          ) : (
            <Button
              className='w-full sm:w-auto opacity-50'
              disabled
              variant='outline'
            >
              <Plus className='mr-2 h-4 w-4' />
              Create Period
            </Button>
          )}
        </div>

        <Card>
          <CardContent className='p-6'>
            <PeriodFilters filters={filters} onFilterChange={updateFilters} />

            {loading && <Loading title='Loading periods...' />}

            {!loading && !error && periods.length === 0 && (
              <PeriodEmptyState canCreate={canCreatePeriods} />
            )}

            {!loading && !error && periods.length > 0 && (
              <>
                <PeriodTable
                  periods={periods}
                  deletePeriod={deletePeriod}
                  canEdit={canEditPeriods}
                  canDelete={canDeletePeriods}
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
