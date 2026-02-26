import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DegreesTable } from './_components/degrees-table';

export const metadata = { title: 'JKKN API – Degrees' };

export default function JkknDegreesPage() {
  return (
    <ContentLayout title="JKKN Degrees">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'JKKN API' },
          { label: 'Degrees' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Degrees</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Live data from the JKKN central API — all degree offerings across the network.
          </p>
        </div>
        <DegreesTable />
      </div>
    </ContentLayout>
  );
}
