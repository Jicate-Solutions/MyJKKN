// app/(routes)/applications/new/page.tsx
'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { ApplicationForm } from '../_components/application-form';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';

export default function NewApplicationPage() {
  return (
    <ContentLayout title='New Application'>
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
              <Link href='/applications'>Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Application</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Application</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Add a new application to the platform
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ApplicationForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
