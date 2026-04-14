import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DeliverablesList } from './_components/deliverables-list';

export const metadata: Metadata = {
  title: 'Deliverables | Solutions Hub',
  description: 'Content deliverables approval workflow',
};

export default function DeliverablesPage() {
  return (
    <ContentLayout title="Deliverables">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content', href: '/solutions/content' },
          { label: 'Deliverables' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Deliverables</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Review and approve content deliverables
          </p>
        </div>

        <DeliverablesList />
      </div>
    </ContentLayout>
  );
}
