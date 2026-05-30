'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
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
  const adapt = useAdaptiveLabels();
  const coursesLabel = adapt('Courses');
  const courseLabel = adapt('Course');
  const degreeLabel = adapt('degree');
  const departmentLabel = adapt('department');
  const programLabel = adapt('program');
  const semesterLabel = adapt('semester');

  return (
    <ContentLayout title={`New ${courseLabel} Mapping`}>
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
              <Link href='/organizations/courses'>{coursesLabel}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations/courses/mappings'>
                {courseLabel} Mappings
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
          <h1 className='text-2xl font-bold'>Create {courseLabel} Mapping</h1>
          <p className='text-muted-foreground mt-1'>
            Associate a {courseLabel.toLowerCase()} with an institution, {degreeLabel}, {departmentLabel}, {programLabel},
            and {semesterLabel}
          </p>
        </div>

        <CourseMappingForm />
      </div>
    </ContentLayout>
  );
}
