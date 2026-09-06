'use client';


import { Suspense, use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { RegistrationsTable } from './_components/registrations-table';
import { NotParticipatedTable } from './_components/not-participated-table';
import { SarvamGalattaTable } from './_components/sarvam-galatta-table';
import { ArrowLeft, Loader2, Users, UserX } from 'lucide-react';
import { useTabParam } from '@/hooks/use-tab-param';

const REGISTRATIONS_TABS = ['teams', 'not-participated'] as const;

function AdminRegistrationsPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useTabParam('teams', REGISTRATIONS_TABS);
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

        {/* Individual-registration events use the per-registrant admin view */}
        {(['individual', 'sarvam_galatta'] as string[]).includes((event.config as any)?.registration_type) ? (
          <SarvamGalattaTable eventId={id} eventName={event.name} />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
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
        )}
      </div>
    </ContentLayout>
  );
}

export default function AdminRegistrationsPage(props: { params: Promise<{ id: string }> }) {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <AdminRegistrationsPageInner {...props} />
    </Suspense>
  );
}
