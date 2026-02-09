import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { BuildersList } from './_components/builders-list';

export const metadata: Metadata = {
  title: 'Builders | Solutions Hub',
  description: 'Manage the builder talent pool across all solution types',
};

export default function BuildersPage() {
  return (
    <ContentLayout title="Builders">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Builders' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Builders</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage the talent pool across all solution types — software, training, content, and more
          </p>
        </div>

        <BuildersList />
      </div>
    </ContentLayout>
  );
}
