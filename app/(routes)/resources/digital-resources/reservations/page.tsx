import React from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Suspense } from 'react';
import { DigitalReservationsTableSkeleton } from './_components/digital-reservations-table-skeleton';
import { DigitalReservationsTable } from './_components/digital-reservations-table';

export default function DigitalResourceReservationsPage() {
  return (
    <ContentLayout title='Digital Resource Reservations'>
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
              <Link href='/resources/digital-resources'>Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Reservations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              Digital Resource Reservations
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage all digital resource reservations
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/resources/digital-resources/reservations/new'>
                <Plus className='mr-2 h-4 w-4' />
                Create Reservation
              </Link>
            </Button>
          </div>
        </div>

        <Suspense fallback={<DigitalReservationsTableSkeleton />}>
          <DigitalReservationsTable />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
