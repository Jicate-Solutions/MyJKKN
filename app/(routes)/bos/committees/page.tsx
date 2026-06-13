// app/(routes)/bos/committees/page.tsx
// Institution-wise BoS Committees — experts-style list (filters + DataTable
// with search, sorting, selection, pagination). Members of a composition are
// grouped under these committees on the composition detail page.

import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CommitteeDataTable } from './_components/committee-data-table';
import { CommitteeFiltersClient } from './_components/committee-filters-client';
import { committeeSearchParamsSchema } from './_components/data-table-schema';

interface CommitteesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CommitteesPage({ searchParams }: CommitteesPageProps) {
  const params = await searchParams;
  const search = committeeSearchParamsSchema.parse(params);

  return (
    <PermissionGuard module='academic.bos-compositions' action='view'>
      <Card>
        <CardContent className='p-6'>
          <div className='space-y-6'>
            <CommitteeFiltersClient searchParams={search} />
            <CommitteeDataTable search={search} />
          </div>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
