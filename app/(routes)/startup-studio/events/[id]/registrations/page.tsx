'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { RegistrationsTable } from './_components/registrations-table';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function AdminRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const { data: event, isLoading } = useEvent(id);
  const isSuperAdmin = profile?.is_super_admin === true;

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
    <ContentLayout title="Registrations">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name, href: `/startup-studio/events/${id}` },
        { label: 'Registrations' },
      ]} />

      <div className="space-y-6 mt-4 max-w-7xl">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/startup-studio/events/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Event
        </Button>

        <div>
          <h1 className="text-2xl font-bold py-1">Registrations</h1>
          <p className="text-sm text-muted-foreground">{event.name}</p>
        </div>

        {/* Stats + filters + table are all co-located inside RegistrationsTable */}
        <RegistrationsTable eventId={id} isSuperAdmin={isSuperAdmin} />
      </div>
    </ContentLayout>
  );
}
