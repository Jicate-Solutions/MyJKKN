'use client';

// The attendee's feedback page: /events/<id>/feedback/respond[?form=<slug>]
//
// Type-agnostic, like its coordinator sibling — an attendee of a marathon and
// an attendee of a seminar answer the same way, so there is one address for
// both.
//
// The `form` query parameter picks WHICH form when the event has several (a
// three-day conference runs one per day). Without it the page offers whatever
// is open: it auto-selects when exactly one form is, and lists them when more
// than one is — silently picking the first would drop an attendee into the
// wrong day's questions.

import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, Loader2, MessageSquare } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGeneralEvent } from '@/hooks/events/use-general-events';
import { useEventFeedbackForms } from '@/hooks/events/use-event-feedback';
import { FeedbackRespondForm } from '@/components/events/feedback/feedback-respond-form';
import { feedbackFormState } from '@/types/event-feedback';

export default function EventFeedbackRespondPage() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const id = String(params?.id ?? '');
  const slug = search.get('form');

  const { data: event, isLoading: eventLoading } = useGeneralEvent(id);
  // RLS already limits these rows to events the caller is registered for, so an
  // empty list here means either "no forms" or "not a participant" — the
  // respond form distinguishes the two once a form is chosen.
  const { data: forms, isLoading: formsLoading } = useEventFeedbackForms(id);

  const openForms = useMemo(
    () => (forms ?? []).filter((f) => feedbackFormState(f) === 'active'),
    [forms]
  );

  const selected = useMemo(() => {
    if (slug) return (forms ?? []).find((f) => f.slug === slug) ?? null;
    return openForms.length === 1 ? openForms[0] : null;
  }, [slug, forms, openForms]);

  if (eventLoading || formsLoading) {
    return (
      <ContentLayout title="Event Feedback">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Event Feedback">
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

  const body = selected ? (
    <FeedbackRespondForm eventId={id} formId={selected.id} />
  ) : openForms.length === 0 ? (
    <Card>
      <CardContent className="space-y-2 py-12 text-center">
        <CalendarClock className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">No feedback is being collected right now</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {slug
            ? 'That feedback form is closed or does not exist on this event.'
            : 'The organisers have not opened a feedback form for this event yet. Check back after it finishes.'}
        </p>
      </CardContent>
    </Card>
  ) : (
    // More than one form is open — let the attendee pick rather than guessing.
    <div className="mx-auto max-w-2xl space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose which feedback you&apos;d like to give:
      </p>
      {openForms.map((form) => (
        <Card key={form.id}>
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{form.name}</p>
              {form.description && (
                <p className="truncate text-xs text-muted-foreground">{form.description}</p>
              )}
            </div>
            <Button
              size="sm"
              onClick={() =>
                router.push(`/events/${id}/feedback/respond?form=${form.slug}`)
              }
            >
              <MessageSquare className="mr-1.5 h-4 w-4" /> Answer
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <ContentLayout title={`Feedback · ${event.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: event.name, href: `/events/${id}` },
          { label: 'Feedback' },
        ]}
      />
      <div className="mt-4">{body}</div>
    </ContentLayout>
  );
}
