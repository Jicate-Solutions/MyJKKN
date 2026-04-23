'use client';

// app/(routes)/admission/settings/years/new/page.tsx

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { AdmissionYearForm } from '../_components/admission-year-form';
import { Card, CardContent } from '@/components/ui/card';
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
 * Relocated out of the import block (PR #396 bug sweep — fix missed this file).
 */
export const navMeta = {
  invokedFrom: '/admission/settings/years',
} as const;

export default function NewAdmissionYearPage() {
  return (
    <ContentLayout title='New Admission Year'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/admission/dashboard'>Admission</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/admission/settings'>Settings</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/admission/settings/years'>Admission Years</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Admission Year</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Admission Year</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new admission year for a program
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <AdmissionYearForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
