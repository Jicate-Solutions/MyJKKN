import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { NewClientForm } from './_components/new-client-form';

export const metadata: Metadata = {
  title: 'Add Client | Solutions Hub',
  description: 'Add a new client to the Solutions Hub',
};

export default function NewClientPage() {
  return (
    <ContentLayout title="Add Client">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Clients', href: '/solutions/clients' },
          { label: 'New Client' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Add New Client</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Create a new client record in the system
          </p>
        </div>
        <NewClientForm />
      </div>
    </ContentLayout>
  );
}
