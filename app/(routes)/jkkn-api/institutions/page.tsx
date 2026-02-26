// app/(routes)/jkkn-api/institutions/page.tsx
// Server component — layout shell only. All data fetching is client-side
// via React Query inside InstitutionsTable so we can have proper loading /
// error states without blocking the initial render.

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { InstitutionsTable } from './_components/institutions-table';

export const metadata = {
  title: 'JKKN API – Institutions',
};

export default function JkknInstitutionsPage() {
  return (
    <ContentLayout title="JKKN Institutions">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'JKKN API' },
          { label: 'Institutions' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Institutions</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Live data from the JKKN central API — all institutions in the
            network.
          </p>
        </div>

        <InstitutionsTable />
      </div>
    </ContentLayout>
  );
}
