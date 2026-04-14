import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { OverviewGrid } from './_components/overview-grid';

export const metadata: Metadata = {
  title: 'Paradigm Shift | Solutions Hub',
  description: 'Department readiness dashboard for the Research Paradigm Shift',
};

export default function ParadigmShiftPage() {
  return (
    <ContentLayout title="Paradigm Shift Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Paradigm Shift' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Research Paradigm Shift</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Every department becomes a Solutions Department. Self-validating metrics from real data — no manual forms.
          </p>
        </div>

        <OverviewGrid />
      </div>
    </ContentLayout>
  );
}
