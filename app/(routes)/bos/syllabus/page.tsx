import { Card, CardContent } from '@/components/ui/card';
import { BosViewGuard } from '@/components/auth/bos-view-guard';
import { SyllabusDataTable } from './_components/syllabus-data-table';
import { SyllabusFiltersClient } from './_components/syllabus-filters-client';
import { SyllabusActions } from './_components/syllabus-actions';
import { syllabusSearchParamsSchema } from './_components/data-table-schema';

interface SyllabusPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SyllabusPage({ searchParams }: SyllabusPageProps) {
  const params = await searchParams;
  const search = syllabusSearchParamsSchema.parse(params);

  return (
    <BosViewGuard module='academic.bos-syllabus'>
      <Card>
        <CardContent className='p-6'>
          <div className='space-y-6'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h1 className='text-xl font-semibold'>Course Syllabi</h1>
                <p className='text-sm text-muted-foreground'>
                  Manage Board of Studies course syllabus.
                </p>
              </div>
              <SyllabusActions />
            </div>
            <SyllabusFiltersClient searchParams={search} />
            <SyllabusDataTable search={search} />
          </div>
        </CardContent>
      </Card>
    </BosViewGuard>
  );
}
