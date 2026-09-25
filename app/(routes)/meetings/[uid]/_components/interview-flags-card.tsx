// app/(routes)/meetings/[uid]/_components/interview-flags-card.tsx
//
// What the host should know about the candidate before the interview starts:
// which round this is (#5), whether they were already rejected or hired (#6),
// whether they failed to turn up before (#10), and whether they ever applied
// for this post (#15). Every flag is derived by the service at read time; this
// component only words them. Nothing about recording belongs here (#9).
//
// No 'use client': it renders on the server with the page, and only the no-show
// buttons inside it are interactive.

import type { ReactNode } from 'react';
import { AlertTriangle, UserSearch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { InterviewFlags } from '@/lib/services/hr/interview-booking-service';
import { InterviewNoShowButtons } from './interview-no-show-buttons';

interface InterviewFlagsCardProps {
  flags: InterviewFlags;
  /** The viewer may change interview rows (super admin, admin or hr.recruitment.edit). */
  canEdit: boolean;
  /** The meeting's end time has passed. */
  meetingEnded: boolean;
}

/** "Tue 16 Sep 2026", in India time whatever the server's zone. */
export function formatNoShowDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
}

const PRIOR_OUTCOME_TEXT: Record<'rejected' | 'joined', string> = {
  rejected: 'This candidate was already rejected before this interview was booked.',
  joined: 'This candidate had already joined JKKN before this interview was booked.',
};

function Flag({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function InterviewFlagsCard({ flags, canEdit, meetingEnded }: InterviewFlagsCardProps) {
  const noShowDates = flags.priorNoShows.map((n) => formatNoShowDate(n.scheduledAt));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <UserSearch className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span>Interview · Round {flags.round}</span>
          {flags.bookedViaLink ? (
            <Badge variant="outline" className="font-normal">
              Booked through the interview link
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* #6 — the booking went through; the host is told here instead. */}
        {flags.priorOutcome ? <Flag>{PRIOR_OUTCOME_TEXT[flags.priorOutcome]}</Flag> : null}

        {/* #10 — earlier interviews this person did not attend, newest first. */}
        {noShowDates.length === 1 ? <Flag>{`Did not turn up on ${noShowDates[0]}`}</Flag> : null}
        {noShowDates.length > 1 ? (
          <Flag>
            <p>Did not turn up on:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {noShowDates.map((d, i) => (
                <li key={flags.priorNoShows[i].interviewId}>{d}</li>
              ))}
            </ul>
          </Flag>
        ) : null}

        {/* #15 — false means checked and none found; null means no post to check. */}
        {flags.hasApplication === false ? <Flag>No application on file for this post.</Flag> : null}

        {flags.status === 'no_show' ? (
          <p className="text-sm text-muted-foreground">Marked as a no-show for this interview.</p>
        ) : null}

        {canEdit ? (
          <InterviewNoShowButtons
            interviewId={flags.interviewId}
            status={flags.status}
            meetingEnded={meetingEnded}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
