'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { VenuesPanel } from './_components/venues-panel';

export default function VenuesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: 'Event', href: `/startup-studio/events/${id}` },
          { label: 'Venues & Mentors' },
        ]}
      />
      <VenuesPanel eventId={id} />
    </ContentLayout>
  );
}
