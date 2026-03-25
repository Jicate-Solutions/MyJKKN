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
import { BatchesDataTable } from './_components/batch-data-table';
import { batchesSearchParamsSchema } from './_components/data-table-schema';
import { BatchFiltersClient } from './_components/batch-filters-client';

interface BatchesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function BatchesPage({ searchParams }: BatchesPageProps) {
  const params = await searchParams;
  const search = batchesSearchParamsSchema.parse(params);

  return (
    <PermissionGuard module='academic.batches' action='view'>
      <ContentLayout title='Academic Batches'>
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
                <BreadcrumbPage>Batches</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Main Content */}
          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                {/* Filters */}
                <BatchFiltersClient searchParams={search} />

                {/* Data Table */}
                <BatchesDataTable search={search} />
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
