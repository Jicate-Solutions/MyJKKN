export const dynamic = 'force-dynamic';

// app/(routes)/admission/settings/years/[id]/page.tsx

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
import { getAdmissionYear } from './_data/get-admission-year';
import { AdmissionYearHeader } from './_components/admission-year-header';
import { AdmissionYearDetails } from './_components/admission-year-details';

interface AdmissionYearDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdmissionYearDetailsPage({
  params
}: AdmissionYearDetailsPageProps) {
  const { id } = await params;
  const admissionYear = await getAdmissionYear(id);

  return (
    <ContentLayout title='Admission Year Details'>
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
            <BreadcrumbPage>Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <AdmissionYearHeader admissionYear={admissionYear} />
        <AdmissionYearDetails admissionYear={admissionYear} />
      </div>
    </ContentLayout>
  );
}
