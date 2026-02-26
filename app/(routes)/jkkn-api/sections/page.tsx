import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SectionsTable } from './_components/sections-table';

export const metadata = { title: 'JKKN API – Sections' };

export default function JkknSectionsPage() {
  return (
    <ContentLayout title="JKKN Sections">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'JKKN API' },
          { label: 'Sections' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Sections</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Live data from the JKKN central API — all class sections across the network.
          </p>
        </div>
        <SectionsTable />
      </div>
    </ContentLayout>
  );
}
