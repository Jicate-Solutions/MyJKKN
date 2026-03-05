'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { RegistrationsTable } from './_components/registrations-table';
import { Loader2 } from 'lucide-react';

export default function AdminRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event, isLoading } = useEvent(id);

  if (isLoading) {
    return (
      <ContentLayout title="Registrations">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Registrations">
        <div className="text-center py-20 text-muted-foreground">Event not found.</div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Registrations - ${event.name}`}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name, href: `/startup-studio/events/${id}` },
        { label: 'Registrations' },
      ]} />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Registrations</h1>
          <p className="text-sm text-muted-foreground">
            Manage team registrations, check-in, and Lovable verification
          </p>
        </div>
        <RegistrationsTable eventId={id} />
      </div>
    </ContentLayout>
  );
}
