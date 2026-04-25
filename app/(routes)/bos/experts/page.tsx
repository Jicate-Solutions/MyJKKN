import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ExpertDataTable } from './_components/expert-data-table';
import { ExpertFiltersClient } from './_components/expert-filters-client';
import { expertSearchParamsSchema } from './_components/data-table-schema';

interface ExpertsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ExpertsPage({ searchParams }: ExpertsPageProps) {
  const params = await searchParams;
  const search = expertSearchParamsSchema.parse(params);

  return (
    <PermissionGuard module='academic.bos-experts' action='view'>
      <Card>
        <CardContent className='p-6'>
          <div className='space-y-6'>
            <ExpertFiltersClient searchParams={search} />
            <ExpertDataTable search={search} />
          </div>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
