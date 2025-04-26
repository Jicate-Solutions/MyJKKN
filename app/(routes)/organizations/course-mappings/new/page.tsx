'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { CourseMappingForm } from '../_components/course-mapping-form';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

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
              <Link href='/organizations/course-mappings'>Course Mappings</Link>
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
          <h1 className='text-2xl font-bold py-1'>New Course Mapping</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Map a course to a degree, department, program, and semester
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <CourseMappingForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
