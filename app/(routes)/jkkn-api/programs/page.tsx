import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProgramsTable } from './_components/programs-table';

export const metadata = { title: 'JKKN API – Programs' };

export default function JkknProgramsPage() {
  return (
    <ContentLayout title="JKKN Programs">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'JKKN API' },
          { label: 'Programs' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Programs</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Live data from the JKKN central API — all academic programs across
            the network.
          </p>
        </div>
        <ProgramsTable />
      </div>
    </ContentLayout>
  );
}
