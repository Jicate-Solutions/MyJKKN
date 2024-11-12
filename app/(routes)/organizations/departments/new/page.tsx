// app/(routes)/organizations/departments/new/page.tsx
'use client';

import { use } from 'react';
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

interface NewDepartmentPageProps {
  searchParams: Promise<{ institutionId?: string }>;
}

export default function NewDepartmentPage({
  searchParams
}: NewDepartmentPageProps) {
  const params = use(searchParams);
  const institutionId = params?.institutionId;

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
          {institutionId ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/organizations/institutions'>Institutions</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/organizations/institutions/${institutionId}`}>
                    Institution Details
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/organizations/departments'>Departments</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>New Department</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Department</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new department
            {institutionId ? ' for this institution' : ''}
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DepartmentForm institutionId={institutionId} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
