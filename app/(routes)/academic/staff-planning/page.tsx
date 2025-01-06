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
import { BeatLoader } from 'react-spinners';
import { StaffPlanFilters } from './_components/staff-plan-filters';
import { StaffPlanList } from './_components/staff-plan-list';
import { useStaffPlans } from '@/hooks/academic/use-staff-plans';

export default function StaffPlanningPage() {
  const {
    staffPlans,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchStaffPlans
  } = useStaffPlans();

  useEffect(() => {
    fetchStaffPlans();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Staff Planning'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchStaffPlans()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Staff Planning'>
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
              <Link href='/academic/staff-planning'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Staff Planning</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Staff Planning</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage staff course assignments and planning
            </p>
          </div>
          <Button className='w-full sm:w-auto' asChild>
            <Link href='/academic/staff-planning/new'>
              <Plus className='mr-2 h-4 w-4' />
              Create Staff Plan
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            <StaffPlanFilters
              filters={filters}
              onFilterChange={updateFilters}
            />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <StaffPlanList
                staffPlans={staffPlans}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchStaffPlans}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
