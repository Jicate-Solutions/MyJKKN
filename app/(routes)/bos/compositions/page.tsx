import { Card, CardContent } from '@/components/ui/card';
import { BosViewGuard } from '@/components/auth/bos-view-guard';
import { CompositionDataTable } from './_components/composition-data-table';
import { CompositionFiltersClient } from './_components/composition-filters-client';
import { compositionSearchParamsSchema } from './_components/data-table-schema';

interface CompositionsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CompositionsPage({ searchParams }: CompositionsPageProps) {
  const params = await searchParams;
  const search = compositionSearchParamsSchema.parse(params);

  return (
    <BosViewGuard module='academic.bos-compositions'>
      <Card>
        <CardContent className='p-6'>
          <div className='space-y-6'>
            <CompositionFiltersClient searchParams={search} />
            <CompositionDataTable search={search} />
          </div>
        </CardContent>
      </Card>
    </BosViewGuard>
  );
}
