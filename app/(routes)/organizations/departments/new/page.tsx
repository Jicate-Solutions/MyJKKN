// app/(routes)/organizations/departments/new/page.tsx

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { DepartmentForm } from '../_components/department-form';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

export default function NewDepartmentPage() {
  return (
    <ContentLayout title='New Department'>
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
              <Link href='/organizations/departments'>Departments</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Department</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Department</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Add a new department for an institution
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DepartmentForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
