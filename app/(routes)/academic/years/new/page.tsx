// app/(routes)/academic/years/new/page.tsx

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { AcademicYearForm } from '../_components/academic-year-form';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

export default function NewAcademicYearPage() {
  return (
    <ContentLayout title='New Academic Year'>
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
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/years'>Academic Years</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Academic Year</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Academic Year</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new academic year for your institution
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <AcademicYearForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
