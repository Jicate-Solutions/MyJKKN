'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { RegistrationForm } from './_components/registration-form';
import { SarvamGalattaForm } from './_components/sarvam-galatta-form';
import { Loader2, ShieldX } from 'lucide-react';

export default function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event, isPending: eventPending } = useEvent(id);
  const { profile, isLoading: authLoading } = useAuth();

  if ((authLoading && !profile) || eventPending) {
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

  const isSuperAdmin = (profile as any)?.is_super_admin || profile?.role === 'super_admin';
  const isStudent = profile?.role === 'student';
  const canRegister = isStudent || isSuperAdmin;

  if (!canRegister) {
    return (
      <ContentLayout title="Register">
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <ShieldX className="h-10 w-10 text-destructive/60" />
          <p className="text-base font-medium">Registration not available for your account</p>
          <p className="text-sm">Only students can register teams for this event.</p>
        </div>
      </ContentLayout>
    );
  }

  const isOpen = event.status === 'registration_open' &&
    event.registration_deadline &&
    new Date(event.registration_deadline) > new Date();

  if (!isOpen && !isSuperAdmin) {
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

      {/* Individual registration events use a config-driven dynamic form */}
      {(['individual', 'sarvam_galatta'] as string[]).includes((event.config as any)?.registration_type) ? (
        <div className="mt-4 max-w-2xl space-y-4">
          <div>
            <h1 className="py-1 text-2xl font-bold">Register for {event.name}</h1>
            <p className="text-sm text-muted-foreground">
              Individual registration — one entry per student.
            </p>
          </div>
          <SarvamGalattaForm event={event} />
        </div>
      ) : (
        <div className="space-y-6 mt-4 max-w-5xl">
          <div>
            <h1 className="text-2xl font-bold py-1">Register Your Team</h1>
            <p className="text-sm text-muted-foreground">
              Team size: 1-{event.config?.team_max_size || 5} members. At least one member must have a laptop.
            </p>
          </div>
          <RegistrationForm event={event} />
        </div>
      )}
    </ContentLayout>
  );
}
