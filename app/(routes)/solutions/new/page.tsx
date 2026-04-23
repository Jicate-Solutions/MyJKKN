import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { NewSolutionForm } from './_components/new-solution-form';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/solutions',
} as const;


export const metadata: Metadata = {
  title: 'New Solution',
  description: 'Create a new solution',
};

export default function NewSolutionPage() {
  return (
    <ContentLayout title="New Solution">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'New Solution' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Create New Solution</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Create a new software, training, or content solution
          </p>
        </div>

        <NewSolutionForm />
      </div>
    </ContentLayout>
  );
}
