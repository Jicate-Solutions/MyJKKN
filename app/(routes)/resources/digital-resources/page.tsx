'use client';

import React from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Plus, List, BarChart } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { redirect } from 'next/navigation';

export default function DigitalResourcesPage() {
  return (
    <ContentLayout title='Digital Resources'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Digital Resources</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Digital Resources</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage your digital resources, licenses, and reservations
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button className='w-full sm:w-auto' variant='outline' asChild>
              <Link href='/resources/digital-resources/dashboard'>
                <BarChart className='mr-2 h-4 w-4' />
                View Dashboard
              </Link>
            </Button>
            <Button className='w-full sm:w-auto' variant='outline' asChild>
              <Link href='/resources/digital-resources/resources'>
                <List className='mr-2 h-4 w-4' />
                View Resources
              </Link>
            </Button>
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/resources/digital-resources/create'>
                <Plus className='mr-2 h-4 w-4' />
                Add Digital Resource
              </Link>
            </Button>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>Resources</CardTitle>
              <CardDescription>Digital resources catalog</CardDescription>
            </CardHeader>
            <CardContent>
              <p className='mb-4'>
                View, add, edit, and manage your digital resources.
              </p>
              <Button className='w-full' asChild>
                <Link href='/resources/digital-resources/resources'>
                  <List className='mr-2 h-4 w-4' />
                  Manage Resources
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reservations</CardTitle>
              <CardDescription>Resource reservations</CardDescription>
            </CardHeader>
            <CardContent>
              <p className='mb-4'>
                View, create, and manage digital resource reservations.
              </p>
              <Button className='w-full' asChild>
                <Link href='/resources/digital-resources/reservations'>
                  <List className='mr-2 h-4 w-4' />
                  Manage Reservations
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dashboard</CardTitle>
              <CardDescription>Analytics and metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <p className='mb-4'>
                View usage statistics and analytics for your digital resources.
              </p>
              <Button className='w-full' asChild>
                <Link href='/resources/digital-resources/dashboard'>
                  <BarChart className='mr-2 h-4 w-4' />
                  View Dashboard
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
