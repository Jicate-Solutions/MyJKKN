import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { NewProspectForm } from './_components/new-prospect-form';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/solutions/pipeline',
} as const;


export const metadata: Metadata = {
  title: 'New Prospect',
  description: 'Add a new prospect to the pipeline',
};

export default function NewProspectPage() {
  return (
    <ContentLayout title="New Prospect">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Pipeline', href: '/solutions/pipeline' },
          { label: 'New Prospect' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Add New Prospect</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Add a new prospect to the sales pipeline
          </p>
        </div>

        <NewProspectForm />
      </div>
    </ContentLayout>
  );
}
