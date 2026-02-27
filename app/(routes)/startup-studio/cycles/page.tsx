import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CyclesList } from './_components/cycles-list';

export const metadata: Metadata = {
  title: 'Cycles | Startup Studio',
  description: 'View and manage all innovation cycles',
};

export default function CyclesPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Cycles' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Innovation Cycles</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Browse and manage all innovation cycles across events
          </p>
        </div>
        <CyclesList />
      </div>
    </ContentLayout>
  );
}
