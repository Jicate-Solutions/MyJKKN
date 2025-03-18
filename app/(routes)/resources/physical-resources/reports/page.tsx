'use client';

import { useCallback, useState } from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import {
  PlusCircle,
  RefreshCw,
  FilterX,
  Filter,
  ChevronDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ContentLayout } from '@/components/layout/content-layout';
import { ReportsTable } from './_components/reports-table';
import { ReportFilters } from './_components/report-filters';
import { ExportDropdown } from './_components/export-dropdown';
import { useUsageReports } from '@/hooks/resource/physical/use-usage-reports';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';

export default function ReportsPage() {
  const { fetchReports, updateFilters, reports } = useUsageReports();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const handleRefresh = useCallback(() => {
    fetchReports();
    toast.success('Reports refreshed');
  }, [fetchReports]);

  const handleResetFilters = useCallback(() => {
    updateFilters({
      resource_id: undefined,
      start_date: undefined,
      end_date: undefined,
      page: 1
    });
    toast.success('Filters reset');
  }, [updateFilters]);

  return (
    <ContentLayout title='Usage Reports'>
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
              <Link href='/resources/physical-resources/dashboard'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Usage Reports</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Usage Reports</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              View and generate resource usage reports
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              size='sm'
              className='h-9 gap-1'
              onClick={handleRefresh}
            >
              <RefreshCw className='h-4 w-4' />
              <span className='hidden sm:inline'>Refresh</span>
            </Button>
            <Button
              variant='outline'
              size='sm'
              className='h-9 gap-1'
              onClick={handleResetFilters}
            >
              <FilterX className='h-4 w-4' />
              <span className='hidden sm:inline'>Reset Filters</span>
            </Button>

            <Button asChild className='h-9 gap-1'>
              <Link href='/resources/physical-resources/reports/new'>
                <PlusCircle className='h-4 w-4' />
                <span>Generate Report</span>
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between'>
              <CardTitle>Usage Reports</CardTitle>
              <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant='outline' size='sm' className='h-8 gap-1'>
                    <Filter className='h-3.5 w-3.5' />
                    <span>Filters</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        isFiltersOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
            <CardDescription>
              View and manage resource usage reports
            </CardDescription>

            <Collapsible
              open={isFiltersOpen}
              onOpenChange={setIsFiltersOpen}
              className='w-full'
            >
              <CollapsibleContent className='pt-4'>
                <div className='bg-muted/50 p-4 rounded-lg'>
                  <Suspense
                    fallback={<Skeleton className='h-[100px] w-full' />}
                  >
                    <ReportFilters onApply={() => setIsFiltersOpen(false)} />
                  </Suspense>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardHeader>
          <Separator />
          <CardContent className='pt-6'>
            <Suspense fallback={<Skeleton className='h-[400px] w-full' />}>
              <ReportsTable />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
