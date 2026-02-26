import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SemestersTable } from './_components/semesters-table';

export const metadata = { title: 'JKKN API – Semesters' };

export default function JkknSemestersPage() {
  return (
    <ContentLayout title="JKKN Semesters">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'JKKN API' },
          { label: 'Semesters' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Semesters</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Live data from the JKKN central API — all semester offerings across the network.
          </p>
        </div>
        <SemestersTable />
      </div>
    </ContentLayout>
  );
}
