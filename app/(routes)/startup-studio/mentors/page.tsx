import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { MentorDirectory } from './_components/mentor-directory';

export const metadata: Metadata = {
  title: 'Mentor Network | Startup Studio',
};

export default function MentorsPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Mentor Network' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Mentor Network</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage and connect startup mentors with incubated ventures
          </p>
        </div>
        <MentorDirectory />
      </div>
    </ContentLayout>
  );
}
