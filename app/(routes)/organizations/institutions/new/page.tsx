// app/(routes)/organizations/institutions/new/page.tsx
'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { InstitutionForm } from '../_components/institution-form';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

export default function NewInstitutionPage() {
  return (
    <ContentLayout title='New Institution'>
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
              <Link href='/organizations/institutions'>Institutions</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Institution</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        <div>
          <h1 className='text-3xl font-bold'>New Institution</h1>
          <p className='text-muted-foreground'>
            Create a new educational institution
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <InstitutionForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
