'use client';

// The Feedback entry point on an event's console. One component, mounted on all
// four consoles (general, tournament, marathon, induction), so the four never
// drift into describing the feature differently.
//
// It shows TWO different cards depending on who is looking:
//   • a coordinator gets the way in to the builder and the results;
//   • an attendee (a student, a guest, a runner) gets one button — answer.
// The split is decided by fn_can_manage_event_feedback(), the same function
// behind the event_feedback_*_manage policies, so the builder is offered to
// exactly the people the database would let use it.
//
// Showing the manage buttons to everyone (what this card used to do) was safe
// in the sense that RLS refused the writes, but it read to a student as an
// invitation to rewrite their own feedback form. RLS is the gate; this is the
// signpost, and a signpost pointing somewhere the reader may not go is a bug.
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
import {
  useCanManageEventFeedback,
  useEventFeedbackForms,
} from '@/hooks/events/use-event-feedback';
import { feedbackFormState } from '@/types/event-feedback';

export function EventFeedbackLinkCard({ eventId }: { eventId: string }) {
  const { data: forms, isLoading } = useEventFeedbackForms(eventId);
  const { data: canManage } = useCanManageEventFeedback(eventId);

  const openCount = (forms ?? []).filter((f) => feedbackFormState(f) === 'active').length;
  const responseCount = (forms ?? []).reduce((n, f) => n + f.response_count, 0);

  // Undecided authority. Render the card's frame but no action, so an attendee
  // never sees a manage button appear and then vanish.
  const undecided = canManage === undefined;

  // An attendee with nothing to answer and nothing to look back on has no use
  // for the card at all — a coordinator still needs it, to create the first form.
  if (!undecided && !canManage && !isLoading && !forms?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Feedback
        </CardTitle>
        <CardDescription>
          {canManage
            ? 'Ask attendees how the event went. You write the questions and can change them at any time; only registered attendees can answer, once each.'
            : 'Tell the organisers how this event went. You can answer once, and change your answers while the form is open.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Form and response counts are the coordinator's dashboard, not the
            attendee's — an attendee only needs to know whether they can answer. */}
        {canManage &&
          (isLoading ? (
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
          ))}

        {undecided || isLoading ? (
          <Skeleton className="h-9 w-40" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {canManage && (
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
            )}

            {openCount > 0 ? (
              <Button asChild variant={canManage ? 'ghost' : 'default'} className="gap-1.5">
                <Link href={`/events/${eventId}/feedback/respond`}>
                  {canManage ? (
                    'Give feedback'
                  ) : (
                    <>
                      <MessageSquare className="h-4 w-4" />
                      Answer the feedback form
                    </>
                  )}
                </Link>
              </Button>
            ) : (
              !canManage && (
                <p className="text-sm text-muted-foreground">
                  No feedback is being collected right now. Check back after the event
                  finishes.
                </p>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
