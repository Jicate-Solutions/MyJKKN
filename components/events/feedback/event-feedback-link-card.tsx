'use client';

// The Feedback entry point on an event's console. One component, mounted on all
// four consoles (general, tournament, marathon, induction), so the four never
// drift into describing the feature differently.
//
// Safe to render anywhere: listForms() is a pure SELECT, and RLS already limits
// the rows to people who may manage the event or are registered for it. It
// never creates a form — the coordinator does that explicitly inside the
// console, so merely opening an event page cannot materialise an empty
// questionnaire.

import Link from 'next/link';
import { BarChart3, ChevronRight, MessageSquare } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useEventFeedbackForms } from '@/hooks/events/use-event-feedback';
import { feedbackFormState } from '@/types/event-feedback';

export function EventFeedbackLinkCard({ eventId }: { eventId: string }) {
  const { data: forms, isLoading } = useEventFeedbackForms(eventId);

  const openCount = (forms ?? []).filter((f) => feedbackFormState(f) === 'active').length;
  const responseCount = (forms ?? []).reduce((n, f) => n + f.response_count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Feedback
        </CardTitle>
        <CardDescription>
          Ask attendees how the event went. You write the questions and can change them at
          any time; only registered attendees can answer, once each.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-5 w-48" />
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {forms?.length ?? 0} {forms?.length === 1 ? 'form' : 'forms'}
            </span>
            <span>{openCount} open</span>
            <span>
              {responseCount} {responseCount === 1 ? 'response' : 'responses'}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {/* Shown to every viewer, NOT gated on a client-side canManage.
              The gate that matters is fn_can_manage_event_feedback() behind the
              event_feedback_*_manage policies, and it counts the event
              in-charge (events.config->'incharges') as a manager. The page's
              own canEditEvent() does NOT — it knows only about the creator,
              the super admin, and same-institution rows. Gating this link on
              that stricter rule hid the whole feature from the appointed
              coordinator, who is precisely the person it exists for.
              A viewer without authority reaches a console whose writes RLS
              refuses with a toast, which is what the sibling event detail page
              already decided to do. */}
          <Button asChild variant="outline" className="gap-1.5">
            <Link href={`/events/${eventId}/feedback`}>
              {forms?.length ? (
                <>
                  <BarChart3 className="h-4 w-4" />
                  Manage feedback
                </>
              ) : (
                'Set up feedback'
              )}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          {openCount > 0 && (
            <Button asChild variant="ghost" className="gap-1.5">
              <Link href={`/events/${eventId}/feedback/respond`}>Give feedback</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
