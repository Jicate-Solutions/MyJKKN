import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ChecklistView } from './_components/checklist-view';

export const metadata: Metadata = {
  title: 'Checklists | Startup Studio',
};

export default async function ChecklistsPage({
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
          { label: 'Checklists' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <ChecklistView eventId={id} />
      </div>
    </ContentLayout>
  );
}
