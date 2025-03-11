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
import { RequestsTable } from './_components/requests-table';
import { RequestFilters } from './_components/request-filters';
import { useResourceRequests } from '@/hooks/resource/use-resource-requests';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';

export default function ResourceRequestsPage() {
  const { fetchRequests, updateFilters } = useResourceRequests();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const handleRefresh = useCallback(() => {
    fetchRequests();
    toast.success('Resource requests refreshed');
  }, [fetchRequests]);

  const handleResetFilters = useCallback(() => {
    updateFilters({
      search: undefined,
      requester_id: undefined,
      resource_type: undefined,
      priority: undefined,
      status: undefined,
      page: 1
    });
    toast.success('Filters reset');
  }, [updateFilters]);

  return (
    <ContentLayout title='Resource Requests'>
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
              <Link href='/resources'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Resource Requests</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Resource Requests</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage requests for new resources and equipment
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
              <Link href='/resources/requests/new'>
                <PlusCircle className='h-4 w-4' />
                <span>New Request</span>
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between'>
              <CardTitle>Resource Requests</CardTitle>
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
              View and manage resource acquisition requests
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
                    <RequestFilters onApply={() => setIsFiltersOpen(false)} />
                  </Suspense>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardHeader>
          <Separator />
          <CardContent className='pt-6'>
            <Suspense fallback={<Skeleton className='h-[400px] w-full' />}>
              <RequestsTable />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
