'use client';

import React from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Plus, List } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DigitalResourceDashboard } from './_components/digital-resource-dashboard';
import { Suspense } from 'react';

export default function DigitalResourcesPage() {
  return (
    <ContentLayout title="Digital Resources">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Digital Resources</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Digital Resources Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Overview of your digital resources, licenses, and reservations
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" variant="outline" asChild>
              <Link href="/resources/digital-resources/resources">
                <List className="mr-2 h-4 w-4" />
                View Resources
              </Link>
            </Button>
            <Button className="w-full sm:w-auto" asChild>
              <Link href="/resources/digital-resources/create">
                <Plus className="mr-2 h-4 w-4" />
                Add Digital Resource
              </Link>
            </Button>
          </div>
        </div>
        
        <Suspense fallback={<div>Loading dashboard...</div>}>
          <DigitalResourceDashboard />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
