'use client';

// app/(routes)/meetings/[uid]/_components/interview-link-section.tsx
//
// "Was this an interview?" — the one fact a recording cannot supply.
//
// Rendered only when the viewer may actually write an interview record. The
// RLS policies on hr_recruitment_interviews gate on hr.recruitment.create /
// .edit, so offering this control to a host without that permission would show
// a form that fails on submit — the silent-failure shape the project rules
// forbid. The page checks the permission before rendering this at all, and the
// server action re-checks, because a control being hidden is not a security
// boundary.
//
// Structure, pending state and toast feedback follow ./mark-outcome-buttons.tsx,
// which already solved "server component page, server action, refresh the
// badge" on this same screen.

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Link2, Link2Off, UserSearch } from 'lucide-react';
import { MeetingNoteText } from './meeting-note-text';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { linkMeetingToInterview, unlinkMeetingFromInterview } from '../interview-actions';

export interface CandidateOption {
  id: string;
  name: string;
  roleTitle: string | null;
  /**
   * The post this candidate was promoted against, when Recruitment recorded
   * one. Picking the candidate fills the post from this, because asking a
   * second time for something already on their record is how the two answers
   * end up disagreeing.
   */
  jobId: string | null;
}

export interface JobOption {
  id: string;
  title: string;
}

export interface CandidateProfile {
  email: string | null;
  phone: string | null;
  status: string | null;
  cvUrl: string | null;
  currentJob: string | null;
  payExpectation: string | null;
  whyThisRole: string | null;
  qualification: string | null;
  experienceMonths: number | null;
}

export interface CandidateApplication {
  currentJobTitle: string | null;
  currentCompany: string | null;
  experienceMonths: number | null;
  qualification: string | null;
  resumeUrl: string | null;
}

export interface LinkedInterview {
  candidateId?: string | null;
  candidateName: string | null;
  roleTitle: string | null;
  roundName: string | null;
  outcomeSummary: string | null;
  /** The summary is the same text as the Meeting notes card, so it is not repeated. */
  outcomeSameAsNotes?: boolean;
  /** null when the viewer may not read the candidate (RLS). */
  profile?: CandidateProfile | null;
  application?: CandidateApplication | null;
}

function experienceLabel(months: number | null | undefined): string | null {
  if (months === null || months === undefined || months <= 0) return null;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [y ? `${y} yr${y === 1 ? '' : 's'}` : '', m ? `${m} mo` : ''].filter(Boolean);
  return parts.join(' ');
}

/** One labelled line; renders nothing when there is no value. */
function Fact(p: { label: string; children: ReactNode }) {
  const { label } = p;
  const value = p.children;
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Who the interviewer is talking to, on the meeting page itself (Director,
 * 24 Sep 2026: "why can't I see the profile of the candidate during the
 * interview"). Everything the booking form and the application captured.
 */
function CandidatePanel({ linked }: { linked: LinkedInterview }) {
  const p = linked.profile;
  const a = linked.application;
  if (!p && !a) return null;
  const currentJob =
    p?.currentJob ??
    ([a?.currentJobTitle, a?.currentCompany].filter(Boolean).join(', ') || null);
  const experience = experienceLabel(a?.experienceMonths ?? p?.experienceMonths);
  const cv = p?.cvUrl ?? a?.resumeUrl ?? null;
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <dl className="space-y-1.5 text-sm">
        <Fact label="Phone">
          {p?.phone ? (
            <a href={`tel:${p.phone.replace(/\s+/g, '')}`} className="text-primary underline-offset-4 hover:underline">
              {p.phone}
            </a>
          ) : null}
        </Fact>
        <Fact label="Email">
          {p?.email ? (
            <a href={`mailto:${p.email}`} className="text-primary underline-offset-4 hover:underline">
              {p.email}
            </a>
          ) : null}
        </Fact>
        <Fact label="Current job">{currentJob}</Fact>
        <Fact label="Experience">{experience}</Fact>
        <Fact label="Qualification">{a?.qualification ?? p?.qualification ?? null}</Fact>
        <Fact label="Expects">{p?.payExpectation ?? null}</Fact>
        <Fact label="Why this role">{p?.whyThisRole ? <span className="whitespace-pre-wrap">{p.whyThisRole}</span> : null}</Fact>
        <Fact label="CV">
          {cv ? (
            <a href={cv} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
              Open CV <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : (
            <span className="text-muted-foreground">Not on file yet</span>
          )}
        </Fact>
      </dl>
      {linked.candidateId ? (
        <a
          href={`/hr/recruitment/candidates/${linked.candidateId}`}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
        >
          Full candidate record
        </a>
      ) : null}
    </div>
  );
}

// Radix treats "" as "clear the selection" and throws on a SelectItem whose
// value is empty — there is a CI gate in this repository for exactly that. The
// "no particular post" choice therefore carries a real token, converted back to
// null before it reaches the database.
const NO_JOB = '__none__';

export function InterviewLinkSection({
  uid,
  candidates,
  jobs,
  linked,
  canEdit,
}: {
  uid: string;
  candidates: CandidateOption[];
  jobs: JobOption[];
  linked: LinkedInterview | null;
  canEdit: boolean;
}) {
  const [candidateId, setCandidateId] = useState<string>('');
  const [jobId, setJobId] = useState<string>(NO_JOB);
  /** True while the post shown is the one the candidate's own record carries. */
  const [postCameFromCandidate, setPostCameFromCandidate] = useState(false);
  const [saving, startTransition] = useTransition();
  const router = useRouter();

  /**
   * Choosing the candidate chooses their post. Only a post that is actually in
   * the list is adopted — Radix renders a value it has no item for as blank,
   * which would read as "no post chosen" while a real id sat in state.
   */
  function chooseCandidate(id: string) {
    setCandidateId(id);
    const theirJob = candidates.find((c) => c.id === id)?.jobId ?? null;
    const known = theirJob && jobs.some((j) => j.id === theirJob) ? theirJob : null;
    setJobId(known ?? NO_JOB);
    setPostCameFromCandidate(!!known);
  }

  function chooseJob(id: string) {
    setJobId(id);
    setPostCameFromCandidate(false);
  }

  function link() {
    startTransition(async () => {
      const result = await linkMeetingToInterview(uid, candidateId, jobId === NO_JOB ? null : jobId);
      if (result.success) {
        toast.success('Linked. The recording will fill in the outcome when it arrives.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Could not link this meeting.');
      }
    });
  }

  function unlink() {
    startTransition(async () => {
      const result = await unlinkMeetingFromInterview(uid);
      if (result.success) {
        toast.success('Unlinked. The interview record itself is untouched.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Could not unlink this meeting.');
      }
    });
  }

  if (linked) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <UserSearch className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">{linked.candidateName ?? 'A candidate'}</span>
          {linked.roleTitle ? (
            <span className="text-muted-foreground">for {linked.roleTitle}</span>
          ) : null}
          {linked.roundName ? (
            <span className="text-muted-foreground">· {linked.roundName}</span>
          ) : null}
        </div>
        <CandidatePanel linked={linked} />
        {linked.outcomeSummary ? (
          <MeetingNoteText text={linked.outcomeSummary} muted />
        ) : linked.outcomeSameAsNotes ? (
          <p className="text-muted-foreground">The outcome is the Meeting notes summary above.</p>
        ) : (
          <p className="text-muted-foreground">
            No outcome recorded yet. It fills in on its own once the recording arrives.
          </p>
        )}
        {canEdit ? (
          <Button variant="ghost" size="sm" onClick={unlink} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Link2Off className="mr-2 h-4 w-4" aria-hidden />
            )}
            Not an interview
          </Button>
        ) : null}
      </div>
    );
  }

  if (!canEdit) return null;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Link this meeting to the person it was about, and the recording will write its own outcome
        into their interview record.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={candidateId} onValueChange={chooseCandidate}>
          <SelectTrigger className="sm:flex-1" aria-label="Candidate">
            <SelectValue placeholder="Choose the candidate" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.roleTitle ? ` — ${c.roleTitle}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={jobId} onValueChange={chooseJob}>
          <SelectTrigger className="sm:flex-1" aria-label="Post">
            <SelectValue placeholder="Post (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_JOB}>No particular post</SelectItem>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={link} disabled={saving || !candidateId}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Link2 className="mr-2 h-4 w-4" aria-hidden />
          )}
          Link
        </Button>
      </div>
      {postCameFromCandidate ? (
        <p className="text-muted-foreground">
          The post came from this candidate&rsquo;s own record. Change it only if this conversation
          was about a different one.
        </p>
      ) : null}
      {candidates.length === 0 ? (
        <p className="text-muted-foreground">
          No candidates to choose from yet. Add the person under Recruitment first.
        </p>
      ) : null}
    </div>
  );
}
