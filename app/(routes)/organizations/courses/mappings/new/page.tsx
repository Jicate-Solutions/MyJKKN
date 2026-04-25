'use client';

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
import { CourseMappingForm } from '../_components/course-mapping-form';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/organizations/courses/mappings',
} as const;


export default function NewCourseMappingPage() {
  return (
    <ContentLayout title='New Course Mapping'>
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
              <Link href='/organizations/courses'>Courses</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations/courses/mappings'>
                Course Mappings
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Mapping</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold'>Create Course Mapping</h1>
          <p className='text-muted-foreground mt-1'>
            Associate a course with an institution, degree, department, program,
            and semester
          </p>
        </div>

        <CourseMappingForm />
      </div>
    </ContentLayout>
  );
}
