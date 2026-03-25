// app/(routes)/academic/years/page.tsx

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { AcademicYearsDataTable } from './_components/academic-year-data-table';
import { academicYearsSearchParamsSchema } from './_components/data-table-schema';
import { AcademicYearFiltersClient } from './_components/academic-year-filters-client';
import { PermissionGuard } from '@/components/auth/permission-guard';

interface AcademicYearsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AcademicYearsPage({ searchParams }: AcademicYearsPageProps) {
  // Await searchParams (Next.js 16 async API)
  const params = await searchParams;

  // Parse search parameters
  const search = academicYearsSearchParamsSchema.parse(params);

  return (
    <PermissionGuard module='academic.years' action='view'>
      <ContentLayout title='Academic Years'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Academic' },
            { label: 'Academic Years' }
          ]}
        />
        <div className='space-y-6 mt-4'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Academic Years</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage academic years for your institutions
            </p>
          </div>

          {/* Filters */}
          <AcademicYearFiltersClient searchParams={search} />

          {/* Data Table */}
          <AcademicYearsDataTable search={search} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
