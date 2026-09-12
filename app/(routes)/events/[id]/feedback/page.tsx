'use client';

// Feedback console for ONE event — where the coordinator writes the questions
// and reads the answers.
//
// ONE route for every event type on purpose. Unlike the registration-form page,
// this does NOT redirect a tournament / marathon / induction to a dedicated
// console: there is no per-type feedback UI to redirect to, and building four
// near-identical routes would be four copies to keep in step. The specialised
// consoles link HERE instead, so `/events/<id>/feedback` is the single address
// for an event's feedback whatever kind of event it is.
//
// This is the COORDINATOR's address. Whoever is not one is sent to
// /feedback/respond, where the same event's questions are answerable rather
// than editable — a student following a link here wants to give feedback, not
// to rewrite the questionnaire.
//
// The authority asked is fn_can_manage_event_feedback(), the very function
// behind the event_feedback_*_manage policies, NOT the page's own
// canEditEvent(): that one knows the creator, the super admin and
// same-institution rows, but not the appointed in-charge in
// events.config->'incharges', and gating on it would hide the builder from the
// coordinator it exists for. RLS remains the gate — this only decides which of
// the two surfaces to show, and nothing is rendered while the answer is still
// undecided, so a coordinator is never bounced off their own console.

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
import { useCanManageEventFeedback } from '@/hooks/events/use-event-feedback';
import { EventFeedbackPanel } from '@/components/events/feedback/event-feedback-panel';

export default function EventFeedbackPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: event, isLoading, isError } = useGeneralEvent(id);
  const { data: canManage } = useCanManageEventFeedback(id);

  // replace(), not push(): the console is not somewhere an attendee should be
  // able to go Back to.
  useEffect(() => {
    if (id && canManage === false) {
      router.replace(`/events/${id}/feedback/respond`);
    }
  }, [id, canManage, router]);

  // Where "Back" goes: a specialised event returns to ITS console, everything
  // else to the general detail page. The event is the same row either way; only
  // the console that manages it differs.
  const dedicatedConsole = event
    ? DEDICATED_EVENT_CONSOLES[event.event_type as string]
    : undefined;
  const eventHref = dedicatedConsole ? dedicatedConsole(id) : `/events/${id}`;

  // `canManage === undefined` is undecided, and `false` is a redirect already in
  // flight — the builder must not paint in either case.
  if (isLoading || canManage !== true) {
    return (
      <ContentLayout title="Feedback">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (isError || !event) {
    return (
      <ContentLayout title="Feedback">
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

  return (
    <ContentLayout title={`Feedback · ${event.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: event.name, href: eventHref },
          { label: 'Feedback' },
        ]}
      />
      <div className="mt-4">
        <EventFeedbackPanel eventId={id} eventName={event.name} backHref={eventHref} />
      </div>
    </ContentLayout>
  );
}
