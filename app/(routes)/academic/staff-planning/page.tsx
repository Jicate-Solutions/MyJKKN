'use client';

import { useEffect, useState } from 'react';
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
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';

export default function StaffPlanningPage() {
  const [isPageLoading, setIsPageLoading] = useState(true);
  const { canAccess, isSuperAdmin, userProfile } = usePermissions();

  const {
    staffPlans,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchStaffPlans
  } = useStaffPlans({
    ...(!isSuperAdmin &&
      userProfile?.institution_id && {
        institution_id: userProfile.institution_id
      })
  });

  const canViewStaffPlans =
    isSuperAdmin || canAccess('academic.staff.planning', 'view');
  const canCreateStaffPlans =
    isSuperAdmin || canAccess('academic.staff.planning', 'create');
  const canEditStaffPlans =
    isSuperAdmin || canAccess('academic.staff.planning', 'edit');
  const canDeleteStaffPlans =
    isSuperAdmin || canAccess('academic.staff.planning', 'delete');

  useEffect(() => {
    const loadData = async () => {
      await fetchStaffPlans();
      setIsPageLoading(false);
    };

    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPageLoading) {
    return (
      <div className='flex justify-center items-center w-full h-screen'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

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
              <Link href='/academic'>Academic</Link>
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
          {canCreateStaffPlans ? (
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/academic/staff-planning/new'>
                <Plus className='mr-2 h-4 w-4' />
                Create Staff Plan
              </Link>
            </Button>
          ) : (
            <Button
              className='w-full sm:w-auto opacity-50'
              disabled
              variant='outline'
            >
              <Plus className='mr-2 h-4 w-4' />
              Create Staff Plan
            </Button>
          )}
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
                canEdit={canEditStaffPlans}
                canDelete={canDeleteStaffPlans}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
