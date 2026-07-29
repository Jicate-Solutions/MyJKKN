'use client';

// Registration Form builder for a GENERAL event. A thin shell around the same
// RegistrationFormEditor the tournament builder uses — the editor was already
// event-agnostic (it takes nothing but an eventId), so this page contributes
// only the breadcrumb, the access gate and the Back target.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGeneralEvent } from '@/hooks/events/use-general-events';
import { useEventAccess } from '@/hooks/events/use-event-access';
import { RegistrationFormEditor } from '@/components/events/shared/registration-form/registration-form-editor';

export default function GeneralEventRegistrationFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: event, isLoading } = useGeneralEvent(id);
  const access = useEventAccess(event);
  const { canManage, isLoading: accessLoading } = access;

  // Wait for BOTH the event and the permission load before bouncing anyone.
  // Redirecting early throws a real manager off their own page while
  // isSuperAdmin is still false — the bug the tournament builder page
  // documents at the same spot.
  useEffect(() => {
    if (!isLoading && !accessLoading && event && !canManage) {
      router.replace(`/events/${id}`);
    }
  }, [isLoading, accessLoading, event, canManage, id, router]);

  if (isLoading || accessLoading) {
    return (
      <ContentLayout title="Registration Form">
        <Skeleton className="mt-4 h-64 w-full" />
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Registration Form">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Event not found, or you don&apos;t have access to it.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!canManage) return null; // redirecting

  return (
    <ContentLayout title={`Registration Form · ${event.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Events', href: '/events' },
          { label: event.name, href: `/events/${id}` },
          { label: 'Registration Form' },
        ]}
      />
      <RegistrationFormEditor eventId={id} backHref={`/events/${id}`} />
    </ContentLayout>
  );
}
