// app/(routes)/bos/member-types/page.tsx
// Institution-wise BoS Member Types — experts-style list (filters + DataTable
// with search, sorting, selection, pagination). Drives the "Member Type"
// dropdown in the composition Add Member dialog.

import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { MemberTypeDataTable } from './_components/member-type-data-table';
import { MemberTypeFiltersClient } from './_components/member-type-filters-client';
import { memberTypeSearchParamsSchema } from './_components/data-table-schema';

interface MemberTypesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MemberTypesPage({ searchParams }: MemberTypesPageProps) {
  const params = await searchParams;
  const search = memberTypeSearchParamsSchema.parse(params);

  return (
    <PermissionGuard module='academic.bos-compositions' action='view'>
      <Card>
        <CardContent className='p-6'>
          <div className='space-y-6'>
            <MemberTypeFiltersClient searchParams={search} />
            <MemberTypeDataTable search={search} />
          </div>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
