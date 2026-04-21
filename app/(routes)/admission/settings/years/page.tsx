// app/(routes)/admission/settings/years/page.tsx

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
import { AdmissionYearsDataTable } from './_components/admission-year-data-table';
import { admissionYearsSearchParamsSchema } from './_components/data-table-schema';
import { AdmissionYearFiltersClient } from './_components/admission-year-filters-client';
import { PermissionGuard } from '@/components/auth/permission-guard';

interface AdmissionYearsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AdmissionYearsPage({
  searchParams
}: AdmissionYearsPageProps) {
  const params = await searchParams;
  const search = admissionYearsSearchParamsSchema.parse(params);

  return (
    <PermissionGuard module='admission.settings.years' action='view'>
      <ContentLayout title='Admission Years'>
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
              <BreadcrumbPage>Admission Years</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='space-y-6 mt-4'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Admission Years</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage per-program admission year records for your institutions
            </p>
          </div>

          <AdmissionYearFiltersClient searchParams={search} />

          <AdmissionYearsDataTable search={search} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
