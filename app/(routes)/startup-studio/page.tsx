import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SSDashboard } from './_components/ss-dashboard';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Overview of all Startup Studio innovation cycles and metrics',
};

export default function StartupStudioPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Startup Studio</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track innovation cycles, problem discovery, and NIF pipeline
          </p>
        </div>
        <SSDashboard />
      </div>
    </ContentLayout>
  );
}
