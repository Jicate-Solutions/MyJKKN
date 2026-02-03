import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SoftwareOverview } from './_components/software-overview';

export const metadata: Metadata = {
  title: 'Software Development | Solutions Hub',
  description: 'Manage software development solutions',
};

export default function SoftwarePage() {
  return (
    <ContentLayout title="Software Development">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Software' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Software Development</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage software solutions, phases, and builder assignments
          </p>
        </div>

        <SoftwareOverview />
      </div>
    </ContentLayout>
  );
}
