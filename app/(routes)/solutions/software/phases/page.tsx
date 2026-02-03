import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PhasesList } from './_components/phases-list';

export const metadata: Metadata = {
  title: 'Development Phases | Solutions Hub',
  description: 'Manage software development phases',
};

export default function PhasesPage() {
  return (
    <ContentLayout title="Development Phases">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Software', href: '/solutions/software' },
          { label: 'Phases' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Development Phases</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track and manage all software development phases
          </p>
        </div>

        <PhasesList />
      </div>
    </ContentLayout>
  );
}
