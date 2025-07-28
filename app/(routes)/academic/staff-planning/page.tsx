'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { StaffPlanFilters } from './_components/staff-plan-filters';
import { StaffPlanningDataTable } from './_components/staff-planning-data-table';
import { staffPlanningSearchParamsSchema } from './_components/data-table-schema';

export default function StaffPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = staffPlanningSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      
      if (value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      
      // Reset to first page when filters change
      if (key !== 'page') {
        params.delete('page');
      }
      
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    // Keep page and pageSize if they exist
    if (searchParams.get('page')) params.set('page', searchParams.get('page')!);
    if (searchParams.get('pageSize')) params.set('pageSize', searchParams.get('pageSize')!);
    
    router.push(`?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <PermissionGuard module='academic.staff.planning' action='view'>
      <ContentLayout title='Staff Planning'>
        <div className='space-y-6'>
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

          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                <StaffPlanFilters
                  searchParams={search}
                  onFilterChange={handleFilterChange}
                  onClearFilters={handleClearFilters}
                />
                <StaffPlanningDataTable search={search} />
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
