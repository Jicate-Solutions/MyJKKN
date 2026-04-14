import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { BuildersList } from './_components/builders-list';

export const metadata: Metadata = {
  title: 'Builder Pool | Solutions Hub',
  description: 'Manage software builder talent pool',
};

export default function BuildersPage() {
  return (
    <ContentLayout title="Builder Pool">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Software', href: '/solutions/software' },
          { label: 'Builders' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Builder Pool</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage software builder talent and their skills
          </p>
        </div>

        <BuildersList />
      </div>
    </ContentLayout>
  );
}
