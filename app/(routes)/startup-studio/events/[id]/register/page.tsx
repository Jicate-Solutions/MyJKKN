import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { TeamRegistrationForm } from './_components/team-registration-form';

export const metadata: Metadata = {
  title: 'Register Team | Startup Studio',
};

export default async function RegisterTeamPage({
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
          { label: 'Register Team' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <TeamRegistrationForm eventId={id} />
      </div>
    </ContentLayout>
  );
}
