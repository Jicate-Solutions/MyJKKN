'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { RegistrationsTable } from './_components/registrations-table';
import { NotParticipatedTable } from './_components/not-participated-table';
import { ArrowLeft, Loader2, Users, UserX } from 'lucide-react';

export default function AdminRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { data: event, isPending: eventPending } = useEvent(id);
  const isSuperAdmin = profile?.is_super_admin === true;

  if ((authLoading && !profile) || eventPending) {
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

        <Tabs defaultValue="teams">
          <TabsList className="mb-4">
            <TabsTrigger value="teams" className="gap-2">
              <Users className="h-4 w-4" />
              Registered Teams
            </TabsTrigger>
            <TabsTrigger value="not-participated" className="gap-2">
              <UserX className="h-4 w-4" />
              Not Participated
            </TabsTrigger>
          </TabsList>

          <TabsContent value="teams">
            <RegistrationsTable eventId={id} isSuperAdmin={isSuperAdmin} eventName={event.name} />
          </TabsContent>

          <TabsContent value="not-participated">
            <NotParticipatedTable eventId={id} eventName={event.name} />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
