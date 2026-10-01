'use client';

// One candidate from a CVViZ upload: what we know, what the helper proposes and
// why, and the one-tap decision. Phone-first: everything stacks in one column,
// the action buttons are full-width on a small screen.

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  FileX2,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DecideRequest, IntakeOpenJob, IntakeRow } from '@/types/hr-intake';
import { JobPicker } from './job-picker';
import {
  CONFIDENCE_CLASS,
  CONFIDENCE_LABEL,
  actionLine,
  candidateName,
  formatDate,
  isFiled,
  safeHttpUrl,
} from './intake-labels';
import { AMBIGUOUS_RESUME_NOTE, SHARED_RESUME_NOTE } from '@/lib/hr/intake/resume-notes';

export interface CandidateCardProps {
  row: IntakeRow;
  cardNumber: number;
  openJobs: IntakeOpenJob[];
  /** Pre-computed duplicate notice (needs the whole batch to number rows). */
  duplicateNote: string | null;
  onDecide: (req: DecideRequest) => Promise<unknown>;
}

export function CandidateCard({ row, cardNumber, openJobs, duplicateNote, onDecide }: CandidateCardProps) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const inFlight = useRef(false);

  const { candidate, resume, proposal, decision, applied } = row;
  const filed = isFiled(row);
  const profileUrl = safeHttpUrl(candidate.cvviz_profile_url);
  const extract = resume.extract;
  const hasExtract =
    !!extract &&
    !!(extract.qualification || extract.subject || extract.experience_years != null || extract.summary);
  const canAccept = !(proposal.action === 'file_under_job' && !proposal.job_id);

  async function decide(req: DecideRequest) {
    if (inFlight.current) return; // one tap = one decision, even on a double tap
    inFlight.current = true;
    setBusy(true);
    try {
      await onDecide(req);
      setPicking(false);
    } catch {
      // The caller reports the reason; the card simply lets the person retry.
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <article
      aria-label={`Candidate ${cardNumber}: ${candidateName(row)}`}
      className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none"
    >
      {/* Who */}
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Card {cardNumber}
        </p>
        <h3 className="text-lg font-semibold text-foreground">{candidateName(row)}</h3>
        <p className="text-sm text-muted-foreground">
          Applied in CVViZ for:{' '}
          <span className="text-foreground">{candidate.cvviz_job_title || 'no job title given'}</span>
          {candidate.applied_at && <> · {formatDate(candidate.applied_at)}</>}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {profileUrl ? (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              Open CVViZ profile <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : (
            <span className="text-muted-foreground">No CVViZ profile link</span>
          )}
          {resume.matched_upload ? (
            <span className="inline-flex items-center gap-1 text-green-700 dark:text-emerald-400">
              <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" /> Resume found
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <FileX2 className="h-3.5 w-3.5" aria-hidden="true" />
              {proposal.reasons.some((r) => r === SHARED_RESUME_NOTE || r === AMBIGUOUS_RESUME_NOTE)
                ? `Resume held back (${resume.file_name ?? 'shared file name'}): see why below`
                : resume.file_name
                  ? `Resume not found (looked for ${resume.file_name})`
                  : 'No resume named in the export'}
            </span>
          )}
        </div>
        {(candidate.email || candidate.phone) && (
          <p className="break-all text-sm text-muted-foreground">
            {[candidate.email, candidate.phone].filter(Boolean).join(' · ')}
          </p>
        )}
        {candidate.phone_issue && (
          <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Phone problem: {candidate.phone_issue}
          </p>
        )}
      </header>

      {/* What the resume says */}
      {hasExtract && extract && (
        <section aria-label="What the resume says" className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> From the resume
          </p>
          <p className="text-foreground">
            {[
              extract.qualification,
              extract.subject,
              extract.experience_years != null
                ? `${extract.experience_years} ${extract.experience_years === 1 ? 'year' : 'years'} of experience`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {extract.summary && <p className="text-muted-foreground">{extract.summary}</p>}
        </section>
      )}

      {/* The proposal */}
      <section aria-label="The helper's proposal" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-foreground">
            {actionLine(proposal.action, proposal.job_id, proposal.job_title, openJobs)}
          </p>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs font-medium',
              CONFIDENCE_CLASS[proposal.confidence],
            )}
          >
            {CONFIDENCE_LABEL[proposal.confidence]}
          </span>
        </div>
        {proposal.reasons.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {proposal.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        )}
        {proposal.rule_id && (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Learned from {proposal.rule_author_name || 'an earlier correction'}
          </p>
        )}
      </section>

      {duplicateNote && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-700/30 p-2.5 text-sm text-amber-700 dark:border-amber-400/30 dark:text-amber-400">
          <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {duplicateNote}
        </p>
      )}

      {/* The decision so far */}
      {decision && (
        <p className="flex items-start gap-1.5 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-emerald-400" aria-hidden="true" />
          <span>
            Decided{decision.decided_by_name ? ` by ${decision.decided_by_name}` : ''}:{' '}
            {actionLine(decision.action, decision.job_id, null, openJobs)}
            {decision.corrected && ' (a correction)'}
          </span>
        </p>
      )}
      {applied && (
        applied.error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Not filed: {applied.error}
          </p>
        ) : (
          <p className="text-sm font-medium text-green-700 dark:text-emerald-400">
            Filed into MyJKKN on {formatDate(applied.applied_at)}
          </p>
        )
      )}

      {/* One-tap actions */}
      {!filed && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              type="button"
              disabled={busy || !canAccept}
              onClick={() => decide({ action: proposal.action, job_id: proposal.job_id })}
            >
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              aria-expanded={picking}
              onClick={() => setPicking((p) => !p)}
            >
              Change job
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => decide({ action: 'needs_new_job', job_id: null })}
            >
              Needs a new job
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => decide({ action: 'skip', job_id: null })}
            >
              Skip
            </Button>
          </div>
          {!canAccept && (
            <p className="text-xs text-muted-foreground">
              The helper did not pick a job, so there is nothing to accept. Use Change job.
            </p>
          )}
          {picking && (
            <JobPicker
              jobs={openJobs}
              currentJobId={decision?.action === 'file_under_job' ? decision.job_id : null}
              cvvizJobTitle={candidate.cvviz_job_title}
              disabled={busy}
              onPick={(job) => decide({ action: 'file_under_job', job_id: job.id })}
              onCancel={() => setPicking(false)}
            />
          )}
        </div>
      )}
    </article>
  );
}
