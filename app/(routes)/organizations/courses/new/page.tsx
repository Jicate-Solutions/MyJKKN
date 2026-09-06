'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { CourseForm } from '../_components/course-form';
import { Card, CardContent } from '@/components/ui/card';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';


/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/organizations/courses',
} as const;

export default function NewCoursePage() {
  const adapt = useAdaptiveLabels();
  const pageTitle = adapt('New Course');
  const listLabel = adapt('Courses');
  const helpText = adapt('Add a new course to a program');

  return (
    <ContentLayout title={pageTitle}>
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
              <Link href='/organizations/courses'>{listLabel}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>{pageTitle}</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            {helpText}
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <CourseForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
