'use client';

/**
 * Interviews tab — every interview sitting for this job's candidates
 * (applied candidates only, structurally: sittings carry job_id).
 * Read-focused: scheduling/outcomes happen inline on the Candidates tab;
 * this is the job-level overview with panel + scorecard visibility.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle, CalendarClock, ExternalLink, MapPin, Users, Video,
} from 'lucide-react';
import { useInterviews, useCandidatesForJob } from '@/hooks/hr/use-recruitment';
import {
  INTERVIEW_MODE_LABELS,
  type HRRecruitmentInterview,
  type InterviewStatus,
} from '@/types/hr-recruitment';

const STATUS_BADGE: Record<InterviewStatus, string> = {
  scheduled:   'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  completed:   'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  cancelled:   'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
  no_show:     'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  rescheduled: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
};

const STATUS_LABEL: Record<InterviewStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  rescheduled: 'Rescheduled',
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

export function WorkspaceInterviewsTab({ jobId }: { jobId: string }) {
  const { data, isLoading, error } = useInterviews({ job_id: jobId, pageSize: 100 });
  const { data: candidates } = useCandidatesForJob(jobId);

  const candidateById = useMemo(
    () => new Map((candidates ?? []).map((c) => [c.id, c] as const)),
    [candidates],
  );
  const interviews = (data?.data ?? []) as HRRecruitmentInterview[];

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 space-y-2">
              <div className="h-4 w-52 rounded bg-muted/60 animate-pulse" />
              <div className="h-3 w-80 rounded bg-muted/40 animate-pulse" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (interviews.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-2 text-center">
          <CalendarClock className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No interviews yet</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Interviews are scheduled by each approval step&rsquo;s reviewer from the
            Candidates tab (for steps that require one).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 divide-y divide-border">
        {interviews.map((iv) => {
          const cand = candidateById.get(iv.candidate_id);
          const Icon = iv.mode === 'video' ? Video : MapPin;
          return (
            <div key={iv.id} className="p-4 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {cand?.name ?? 'Candidate'}
                </span>
                {iv.round_name && (
                  <span className="text-xs text-muted-foreground">{iv.round_name}</span>
                )}
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[iv.status]}`}>
                  {STATUS_LABEL[iv.status]}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  {fmtWhen(iv.scheduled_at)} · {iv.duration_minutes} min
                </span>
                <span className="inline-flex items-center gap-1">
                  <Icon className="h-3 w-3" />
                  {INTERVIEW_MODE_LABELS[iv.mode]}
                  {iv.location_or_link ? ` · ${iv.location_or_link}` : ''}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {iv.panel_member_ids.length} panel member{iv.panel_member_ids.length === 1 ? '' : 's'}
                </span>
              </div>
              {iv.outcome_summary && (
                <p className="text-xs text-muted-foreground italic">
                  Outcome: &ldquo;{iv.outcome_summary}&rdquo;
                </p>
              )}
              <Link
                href={`/hr/recruitment/interviews/${iv.id}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open interview
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
