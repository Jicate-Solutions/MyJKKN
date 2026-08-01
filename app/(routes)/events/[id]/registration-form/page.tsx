'use client';

// Registration Form builder for a GENERAL event (lecture, cultural programme,
// convocation, …). The builder itself was already event-agnostic end to end —
// RegistrationFormEditor takes only an eventId, the service keys on event_id,
// the save RPC takes p_event_id, and the event_registration_form* RLS policies
// never check event_type. Only the tournament PAGE fenced it off, so this route
// simply unfences it.
//
// `variant="general"` suppresses the tournament-only standard-field panels
// (division / roster / entry fee) — a lecture collects none of those, and
// showing them would promise registrants fields that do not exist.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useGeneralEvent,
  DEDICATED_EVENT_CONSOLES,
} from '@/hooks/events/use-general-events';
import { RegistrationFormsPanel } from '@/components/events/registration/registration-forms-panel';

export default function GeneralEventRegistrationFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: event, isLoading, isError } = useGeneralEvent(id);

  // A tournament reached through this URL has its own builder route, which
  // renders the standard-field panels this one deliberately hides.
  const dedicatedConsole = event
    ? DEDICATED_EVENT_CONSOLES[event.event_type as string]
    : undefined;

  useEffect(() => {
    if (event && dedicatedConsole) {
      router.replace(`${dedicatedConsole(event.id)}/registration-form`);
    }
  }, [event, dedicatedConsole, router]);

  if (isLoading) {
    return (
      <ContentLayout title="Registration Form">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (isError || !event) {
    return (
      <ContentLayout title="Registration Form">
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Event not found, or you don&apos;t have access to it.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/events">Back to Events</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (dedicatedConsole) return null; // redirecting to the tournament builder

  return (
    <ContentLayout title={`Registration Form · ${event.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: event.name, href: `/events/${id}` },
          { label: 'Registration Form' },
        ]}
      />
      <div className="mt-4">
        <RegistrationFormsPanel
          eventId={id}
          variant="general"
          backHref={`/events/${id}`}
          eventName={event.name}
        />
      </div>
    </ContentLayout>
  );
}
