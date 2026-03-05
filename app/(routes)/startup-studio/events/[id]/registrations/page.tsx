import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { RegistrationsDashboard } from './_components/registrations-dashboard';

export const metadata: Metadata = {
  title: 'Registrations | Startup Studio',
};

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Events', href: '/startup-studio/events' },
          { label: 'Registrations' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <RegistrationsDashboard eventId={id} />
      </div>
    </ContentLayout>
  );
}
