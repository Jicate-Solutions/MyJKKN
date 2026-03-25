import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { RegulationsDataTable } from './_components/regulation-data-table';
import { regulationsSearchParamsSchema } from './_components/data-table-schema';
import { RegulationFiltersClient } from './_components/regulation-filters-client';

interface RegulationsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RegulationsPage({ searchParams }: RegulationsPageProps) {
  const params = await searchParams;
  const search = regulationsSearchParamsSchema.parse(params);

  return (
    <PermissionGuard module='academic.regulations' action='view'>
      <ContentLayout title='Academic Regulations'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Regulations</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Main Content */}
          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                {/* Filters */}
                <RegulationFiltersClient searchParams={search} />

                {/* Data Table */}
                <RegulationsDataTable search={search} />
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
