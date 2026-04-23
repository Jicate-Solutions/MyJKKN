'use client';
// app/(routes)/organizations/degrees/new/page.tsx


import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { DegreeForm } from '../_components/degree-form';
import { Card, CardContent } from '@/components/ui/card';
import {

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/organizations/degrees',
} as const;

  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

export default function NewDegreePage() {
  return (
    <ContentLayout title='New Degree'>
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
              <Link href='/organizations'>Organizations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations/degrees'>Degrees</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Degree</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Degree</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Add a new degree program
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DegreeForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
