'use client';

// /my-event-feedback — "which events are waiting on me?"
//
// THIS PAGE IS THE FEATURE, not decoration around it. The respond page at
// /events/<id>/feedback/respond has worked for weeks and collected almost
// nothing, because it has no navigation entry and no list: the only way in was
// somebody pasting the link. Induction solved the same problem with
// /learners/my-induction; general events had no equivalent, and 54 of 55 events
// hold no feedback at all.
//
// Every row comes from fn_my_pending_event_feedback(), which admits a form only
// when the caller could actually submit it — gated on the same attendance-aware
// function the write path uses. Listing a form the database would refuse at
// submit time would repeat the dead end one screen later, so a row here is a
// promise that the Answer button works.
//
// NOT UNDER /learners/. An event is attended by every kind of person the
// platform has — a faculty member at an FDP, a team member at a staff seminar,
// a HOD at a conference, a learner at a sports meet. The /learners/my-* prefix
// is matched by isStudentPortalRoute(), which renders a sidebar row for
// role_key 'student' ONLY and strips it from super admin outright, so a page
// living there would have been invisible to most of the people it is for —
// the same dead end this page exists to remove. It sits at the top level and
// the sidebar treats it as always-visible, like /my-induction-sessions.
//
// Self-scoped by construction: the RPC takes no argument and reads auth.uid().
// There is nothing to gate in this component and nothing here is role-specific.

import { useMemo } from 'react';
import Link from 'next/link';
import {
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyPendingEventFeedback } from '@/hooks/events/use-event-feedback';
import type { PendingEventFeedback } from '@/types/event-feedback';

/** "3 days left" / "Closes today" / null when the form has no end date. */
function closesInLabel(closesAt: string | null): string | null {
  if (!closesAt) return null;
  const ends = new Date(closesAt);
  if (Number.isNaN(ends.getTime())) return null;
  const msLeft = ends.getTime() - Date.now();
  if (msLeft <= 0) return null;
  const days = Math.floor(msLeft / 86_400_000);
  if (days === 0) return 'Closes today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

/**
 * "Ended 9 Sep 2026", or null when the event has not ended yet.
 *
 * A coordinator may open their own form BEFORE the event (the slug
 * 'pre-event-feedback' exists in production), and the RPC's event_ended_at is
 * then a FUTURE moment — printing "Ended 20 Oct 2026" on it is simply false.
 * The routine's own forms are only ever opened after the event, so this guard
 * is only ever load-bearing for a hand-built one.
 */
function endedOnLabel(endedAt: string | null): string | null {
  if (!endedAt) return null;
  const ended = new Date(endedAt);
  if (Number.isNaN(ended.getTime())) return null;
  if (ended.getTime() > Date.now()) return null;
  return ended.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PendingCard({ row }: { row: PendingEventFeedback }) {
  const closing = closesInLabel(row.closes_at);
  const ended = endedOnLabel(row.event_ended_at);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">{row.event_name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {ended && (
              <span className="inline-flex items-center gap-1">
                <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                Ended {ended}
              </span>
            )}
            {closing && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {closing}
              </span>
            )}
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link
            href={`/events/${row.event_id}/feedback/respond?form=${row.form_slug}`}
          >
            <MessageSquare className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Answer
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function MyEventFeedbackPage() {
  const { data, isLoading, isError } = useMyPendingEventFeedback();

  const rows = useMemo(() => data ?? [], [data]);

  let body: React.ReactNode;

  if (isLoading) {
    body = (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (isError) {
    // An error is NOT an empty state. "Nothing to answer" and "we could not ask"
    // look identical to the reader unless they are said differently.
    body = (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          We couldn&apos;t load your feedback list just now. Please refresh the page.
        </CardContent>
      </Card>
    );
  } else if (rows.length === 0) {
    body = (
      <Card>
        <CardContent className="space-y-2 py-12 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Nothing waiting on you</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            When an event you were signed up for finishes, its feedback appears
            here for a couple of weeks. Nothing is sent to you — just look in
            after an event.
          </p>
        </CardContent>
      </Card>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {rows.length === 1
            ? 'One event is waiting for your feedback.'
            : `${rows.length} events are waiting for your feedback.`}{' '}
          It takes under a minute each.
        </p>
        {rows.map((row) => (
          <PendingCard key={row.form_id} row={row} />
        ))}
      </div>
    );
  }

  return (
    <ContentLayout title="Event Feedback">
      <PageBreadcrumb
        items={[{ label: 'Home', href: '/' }, { label: 'Event Feedback' }]}
      />
      <div className="mt-4 max-w-3xl">{body}</div>
    </ContentLayout>
  );
}
