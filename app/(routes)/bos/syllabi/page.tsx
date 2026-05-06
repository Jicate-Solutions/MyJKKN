import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { SyllabusDataTable } from './_components/syllabus-data-table';
import { SyllabusFiltersClient } from './_components/syllabus-filters-client';
import { syllabusSearchParamsSchema } from './_components/data-table-schema';

interface SyllabusPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SyllabusPage({ searchParams }: SyllabusPageProps) {
  const params = await searchParams;
  const search = syllabusSearchParamsSchema.parse(params);

  return (
    <PermissionGuard module='academic.bos-syllabi' action='view'>
      <Card>
        <CardContent className='p-6'>
          <div className='space-y-6'>
            <SyllabusFiltersClient searchParams={search} />
            <SyllabusDataTable search={search} />
          </div>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
