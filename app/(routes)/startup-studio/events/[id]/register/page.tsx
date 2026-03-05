'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { RegistrationForm } from './_components/registration-form';
import { Loader2 } from 'lucide-react';

export default function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event, isLoading } = useEvent(id);

  if (isLoading) {
    return (
      <ContentLayout title="Register">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Register">
        <div className="text-center py-20 text-muted-foreground">Event not found.</div>
      </ContentLayout>
    );
  }

  const isOpen = event.status === 'registration_open' &&
    event.registration_deadline &&
    new Date(event.registration_deadline) > new Date();

  if (!isOpen) {
    return (
      <ContentLayout title="Register">
        <div className="text-center py-20 text-muted-foreground">
          Registration is closed for this event.
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Register - ${event.name}`}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name, href: `/startup-studio/events/${id}` },
        { label: 'Register' },
      ]} />

      <div className="space-y-6 mt-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold py-1">Register Your Team</h1>
          <p className="text-sm text-muted-foreground">
            Team size: 1-{event.config?.team_max_size || 5} members. At least one member must have a laptop.
          </p>
        </div>
        <RegistrationForm event={event} />
      </div>
    </ContentLayout>
  );
}
