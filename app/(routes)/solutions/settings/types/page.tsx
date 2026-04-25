import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SolutionTypesManager } from './_components/solution-types-manager';

export const metadata: Metadata = {
  title: 'Solution Types',
  description: 'Manage solution type categories',
};

/**
 * navMeta — invoked from the Solutions Settings landing via a "Manage Types"
 * CTA. Nav-coverage detector (`scripts/assert-nav-coverage.mjs`) reads this
 * to pass discoverability.
 */
export const navMeta = {
  invokedFrom: '/solutions/settings',
} as const;

export default function SolutionTypesPage() {
  return (
    <ContentLayout title="Solution Types">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Solutions Hub', href: '/solutions' },
        { label: 'Settings' },
        { label: 'Solution Types' },
      ]} />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Solution Types</h1>
          <p className="text-sm text-muted-foreground">Manage the categories of solutions your departments can offer</p>
        </div>
        <SolutionTypesManager />
      </div>
    </ContentLayout>
  );
}
