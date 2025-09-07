'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { AlertTriangle, Settings } from 'lucide-react';
import { TimetablesDataTable } from './_components/timetables-data-table';
import { timetablesSearchParamsSchema } from './_components/data-table-schema';
import { TimetableFilters } from './_components/timetable-filters';

export default function TimetablesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin } = usePermissions();

  // Parse current search parameters
  const search = timetablesSearchParamsSchema.parse(
    Object.fromEntries(searchParams?.entries() ?? [])
  );

  // Handle filter changes by updating URL
  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      // Reset page to 1 when filters change
      params.set('page', '1');

      router.push(`/academic/timetables?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Handle clearing all filters
  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    // Keep only page and pageSize
    params.set('page', '1');
    const pageSize = searchParams?.get('pageSize');
    if (pageSize) {
      params.set('pageSize', pageSize);
    }
    router.push(`/academic/timetables?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <PermissionGuard module='academic.timetables' action='view'>
      <ContentLayout title='Academic Timetables'>
        <div className='space-y-6'>
          {/* Super Admin Controls */}
          {isSuperAdmin && (
            <div className='flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg'>
              <div className='flex items-center gap-2'>
                <Badge variant='destructive' className='gap-1'>
                  <Settings className='h-3 w-3' />
                  Super Admin
                </Badge>
                <span className='text-sm text-red-700'>
                  Advanced timetable management tools available
                </span>
              </div>
              <Button
                variant='outline'
                size='sm'
                className='gap-1 border-red-300 text-red-700 hover:bg-red-100'
                onClick={() => router.push('/academic/timetables/conflicts')}
              >
                <AlertTriangle className='h-3 w-3' />
                View Conflicts
              </Button>
            </div>
          )}
          
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/'>Dashboard</Link>
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

          {/* Main Content */}
          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                {/* Filters */}
                <TimetableFilters
                  searchParams={search}
                  onFilterChange={handleFilterChange}
                  onClearFilters={handleClearFilters}
                />

                {/* Data Table */}
                <TimetablesDataTable search={search} />
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
