import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { NifPipeline } from './_components/nif-pipeline';

export const metadata: Metadata = {
  title: 'NIF Pipeline',
};

export default function NifPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'NIF Pipeline' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">NIF Pipeline</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Nattraja Incubation Forum candidate tracking and pipeline management
          </p>
        </div>
        <NifPipeline />
      </div>
    </ContentLayout>
  );
}
